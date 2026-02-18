/**
 * Backend for Family Login Portal
 */

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const bodyParser = require('body-parser');
const multer = require('multer');
const nodemailer = require('nodemailer');
const { createClient } = require('@supabase/supabase-js');
const { InstagramAutomation } = require('./instagram-automation');
const { YouComAgent } = require('./youcom-agent');
const { encrypt, decrypt } = require('./encryption');
const { generateUsernames, generateEmail } = require('./username-generator');
const { runAllWarmups, runWarmupSession, getWarmupDay, getWarmupPhase } = require('./warmup-scheduler');
const { checkAccountPublic, scrapeProfile, checkScrapeCooldown, saveScrapedData, scrapeEngagedFollowers, saveEngagedFollowers } = require('./apify-scraper');
const { initB2Client, isB2Configured, uploadFamilyMedia, deleteFromB2 } = require('./b2-storage');
const { CommentScheduler } = require('./comment-scheduler');
const { EngagementTracker } = require('./engagement-tracker');
const deepl = require('deepl-node');
const { transliterate } = require('transliteration');
require('dotenv').config();

const app = express();
// Default to 8080 to align with Railway standard, but respect env var if injected
const PORT = process.env.PORT || 8080;

// Configure Multer for memory storage (we upload directly to Supabase)
const upload = multer({ storage: multer.memoryStorage() });

// Initialize Supabase (if env vars are present)
let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
  try {
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    console.log('✅ Supabase client initialized');
  } catch (e) {
    console.error('❌ Supabase initialization failed:', e.message);
    console.error('   Check your SUPABASE_URL in .env');
  }
}

// Initialize Backblaze B2 (if env vars are present)
if (isB2Configured()) {
  initB2Client();
  console.log('✅ Backblaze B2 storage initialized');
} else {
  console.log('ℹ️  Backblaze B2 not configured - using Instagram CDN URLs (they expire in 24-48hrs)');
}

// Initialize DeepL translator (if API key is present)
let translator = null;
if (process.env.DEEPL_API_KEY) {
  try {
    translator = new deepl.Translator(process.env.DEEPL_API_KEY);
    console.log('✅ DeepL translator initialized');
  } catch (e) {
    console.error('❌ DeepL initialization failed:', e.message);
  }
}

// Store active sessions in memory (in production, use Redis)
const activeSessions = new Map();

// Store portal sessions (simple token based)
const portalSessions = new Map();

// Configure Email Transporter
// Helper function to download an image from a URL
const downloadImage = (url) => new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
        // Handle redirects
        if (response.statusCode > 300 && response.statusCode < 400 && response.headers.location) {
            // To avoid potential infinite loops, let's cap redirects.
            // For this use case, 1 redirect should be enough.
            return downloadImage(response.headers.location).then(resolve).catch(reject);
        }
        
        if (response.statusCode !== 200) {
            // Consume response data to free up memory
            response.resume();
            return reject(new Error(`Failed to download image, status code: ${response.statusCode}`));
        }

        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
            try {
                resolve(Buffer.concat(chunks));
            } catch (e) {
                reject(e);
            }
        });
    });
    
    request.on('error', (err) => {
        console.error('Download request error:', err);
        reject(err);
    });
});

// Configure Nodemailer
// Uses standard SMTP variables or defaults to Resend if RESEND_API_KEY is present
let transporterConfig = {
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT || 587,
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
    // Add timeouts to prevent hanging
    connectionTimeout: 5000, // 5 seconds
    greetingTimeout: 5000,
    socketTimeout: 5000
};

// Override with Resend specific settings if API Key is present
const resendKey = process.env.RESEND_API_KEY;
if (resendKey) {
    console.log('📧 Using Resend for emails');
    transporterConfig = {
        host: 'smtp.resend.com',
        port: 465,
        secure: true,
        auth: {
            user: 'resend',
            pass: resendKey
        },
        connectionTimeout: 5000, // 5 seconds
        greetingTimeout: 5000,
        socketTimeout: 5000
    };
}

const transporter = nodemailer.createTransport(transporterConfig);

app.use(bodyParser.json());
// Serve static files with caching to improve load speed in low-bandwidth areas
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: 0, // Disable cache for development
  index: false // Let the explicit / route handle index.html to ensure headers are applied
}));

// Basic Auth Middleware for Admin Routes
const basicAuth = (req, res, next) => {
  const user = process.env.N8N_BASIC_AUTH_USER || 'admin';
  const pass = process.env.N8N_BASIC_AUTH_PASSWORD || 'password';

  const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
  const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');

  if (login && password && login === user && password === pass) {
    return next();
  }

  res.set('WWW-Authenticate', 'Basic realm="Gaza Protocol Admin"');
  res.status(401).send('Authentication required.');
};

// Portal Auth Middleware
const portalAuth = (req, res, next) => {
  const token = req.headers['x-portal-token'];
  if (!token || !portalSessions.has(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.user = portalSessions.get(token);
  next();
};

// Explicitly serve index.html for the root route
app.get('/', (req, res) => {
  // Disable caching to ensure updates are seen immediately
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  console.log('🌐 Serving index.html to client...');

  const indexPath = path.join(__dirname, 'public', 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      console.error('Error serving index.html:', err);
      res.status(500).send('<h1>Error loading page</h1><p>Could not find <code>public/index.html</code>. Please check server logs.</p>');
    }
  });
});

// Health Check
app.get('/up', (req, res) => {
  res.status(200).send('OK');
});

// Fundraising Redirect (stealth link for Instagram bios)
// Usage: your-app.railway.app/f/abc123 → redirects to family's chuffed.org page
app.get('/f/:familyId', async (req, res) => {
  const { familyId } = req.params;

  if (!supabase) {
    console.error('Supabase not configured for redirect');
    return res.redirect(301, 'https://www.instagram.com'); // Fallback
  }

  try {
    // Look up family's fundraising URL
    const { data, error } = await supabase
      .from('families')
      .select('fundraising_url, name')
      .eq('id', familyId)
      .single();

    if (error || !data) {
      console.log(`Redirect failed for family ID ${familyId}: ${error?.message || 'Not found'}`);
      return res.redirect(301, 'https://www.instagram.com'); // Fallback
    }

    if (data.fundraising_url) {
      console.log(`Redirecting ${familyId} (${data.name}) to ${data.fundraising_url}`);
      return res.redirect(301, data.fundraising_url);
    } else {
      console.log(`Family ${familyId} has no fundraising URL set`);
      return res.redirect(301, 'https://www.instagram.com'); // Fallback
    }
  } catch (err) {
    console.error('Redirect error:', err);
    return res.redirect(301, 'https://www.instagram.com'); // Fallback
  }
});

// Admin Routes
app.get('/admin', basicAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/api/families', basicAuth, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Supabase not configured' });

  // Fetch families (excluding raw sensitive data if needed, though cookies are encrypted)
  const { data, error } = await supabase
    .from('families')
    .select('instagram_handle, status, last_login, children_count, cookies')
    .order('last_login', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// --- INSTAGRAM ACCOUNT CREATION ADMIN ROUTES ---

// Generate username suggestions for a family
app.get('/api/admin/generate-username/:familyId', basicAuth, async (req, res) => {
  const { familyId } = req.params;

  if (!supabase) return res.status(500).json({ error: 'Supabase not configured' });

  try {
    // Fetch family data including children details and proxy city
    const { data: family, error } = await supabase
      .from('families')
      .select('id, name, children_details, proxy_city, ig_username')
      .eq('id', familyId)
      .single();

    if (error || !family) {
      return res.status(404).json({ error: 'Family not found' });
    }

    // Generate username suggestions
    const usernames = generateUsernames(family, 4);

    // Generate email suggestion based on proxy city
    const emailSuggestion = generateEmail(family.proxy_city);

    res.json({
      family_id: family.id,
      family_name: family.name,
      proxy_city: family.proxy_city,
      current_username: family.ig_username,
      username_suggestions: usernames,
      email_suggestion: emailSuggestion
    });
  } catch (e) {
    console.error('Generate username error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Save selected username and email for a family
app.post('/api/admin/save-account/:familyId', basicAuth, async (req, res) => {
  const { familyId } = req.params;
  const { ig_username, ig_email, ig_email_password, ig_password } = req.body;

  if (!supabase) return res.status(500).json({ error: 'Supabase not configured' });

  if (!ig_username) {
    return res.status(400).json({ error: 'ig_username is required' });
  }

  try {
    const updates = {
      ig_username: ig_username.toLowerCase().replace(/^@/, ''), // Remove @ if present
      ig_account_status: 'pending'
    };

    // Encrypt and store email credentials if provided
    if (ig_email) updates.ig_email = ig_email;
    if (ig_email_password) updates.ig_email_password = encrypt(ig_email_password);
    if (ig_password) updates.ig_password = encrypt(ig_password);

    const { error } = await supabase
      .from('families')
      .update(updates)
      .eq('id', familyId);

    if (error) throw error;

    console.log(`Saved IG account details for family ${familyId}: @${updates.ig_username}`);

    res.json({
      status: 'SUCCESS',
      message: `Username @${updates.ig_username} saved for family ${familyId}`,
      ig_username: updates.ig_username
    });
  } catch (e) {
    console.error('Save account error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Update account status (pending -> created -> warming_up -> active)
app.post('/api/admin/account-status/:familyId', basicAuth, async (req, res) => {
  const { familyId } = req.params;
  const { status } = req.body;

  const validStatuses = ['pending', 'created', 'warming_up', 'verified', 'active', 'suspended'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
  }

  if (!supabase) return res.status(500).json({ error: 'Supabase not configured' });

  try {
    const updates = { ig_account_status: status };

    // Set creation timestamp when marked as created
    if (status === 'created') {
      updates.ig_account_created_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('families')
      .update(updates)
      .eq('id', familyId);

    if (error) throw error;

    res.json({ status: 'SUCCESS', new_status: status });
  } catch (e) {
    console.error('Update status error:', e);
    res.status(500).json({ error: e.message });
  }
});

// List all families with account creation status
app.get('/api/admin/accounts', basicAuth, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Supabase not configured' });

  try {
    const { data, error } = await supabase
      .from('families')
      .select('id, name, email, proxy_city, ig_email, ig_username, ig_account_status, ig_account_created_at, children_details, last_warmup_at, warmup_day')
      .order('id', { ascending: true });

    if (error) throw error;

    // Add calculated warm-up info
    const enriched = data.map(family => {
      const day = getWarmupDay(family.ig_account_created_at);
      const phase = getWarmupPhase(day);
      return {
        ...family,
        warmup_calculated_day: day,
        warmup_phase: phase,
        warmup_days_remaining: Math.max(0, 14 - day)
      };
    });

    res.json(enriched);
  } catch (e) {
    console.error('List accounts error:', e);
    res.status(500).json({ error: e.message });
  }
});

// --- WARM-UP ADMIN ROUTES ---

// Get warm-up status for all families
app.get('/api/admin/warmup/status', basicAuth, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Supabase not configured' });

  try {
    const { data, error } = await supabase
      .from('families')
      .select('id, name, ig_username, ig_account_status, ig_account_created_at, last_warmup_at, warmup_day')
      .not('ig_username', 'is', null)
      .order('ig_account_created_at', { ascending: false, nullsFirst: false });

    if (error) throw error;

    const status = data.map(family => {
      const day = getWarmupDay(family.ig_account_created_at);
      const phase = getWarmupPhase(day);
      return {
        id: family.id,
        name: family.name,
        ig_username: family.ig_username,
        status: family.ig_account_status,
        created_at: family.ig_account_created_at,
        last_warmup: family.last_warmup_at,
        day: day,
        phase: phase,
        days_remaining: Math.max(0, 14 - day),
        ready_for_activation: day >= 15
      };
    });

    res.json(status);
  } catch (e) {
    console.error('Warmup status error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Trigger warm-up for a specific family (manual run)
app.post('/api/admin/warmup/:familyId', basicAuth, async (req, res) => {
  const { familyId } = req.params;

  if (!supabase) return res.status(500).json({ error: 'Supabase not configured' });

  try {
    const { data: family, error } = await supabase
      .from('families')
      .select('*')
      .eq('id', familyId)
      .single();

    if (error || !family) {
      return res.status(404).json({ error: 'Family not found' });
    }

    if (!family.ig_username || !family.ig_account_created_at) {
      return res.status(400).json({ error: 'Family does not have an Instagram account set up' });
    }

    // Run warm-up in background (don't block the response)
    res.json({
      status: 'STARTED',
      message: `Warm-up session started for @${family.ig_username}`,
      day: getWarmupDay(family.ig_account_created_at),
      phase: getWarmupPhase(getWarmupDay(family.ig_account_created_at))
    });

    // Execute warm-up asynchronously
    runWarmupSession(family, supabase).then(result => {
      console.log(`Warm-up completed for family ${familyId}:`, result);
    }).catch(err => {
      console.error(`Warm-up failed for family ${familyId}:`, err);
    });

  } catch (e) {
    console.error('Trigger warmup error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Trigger warm-up for ALL eligible families (batch run)
app.post('/api/admin/warmup/run-all', basicAuth, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Supabase not configured' });

  // Start batch warm-up in background
  res.json({
    status: 'STARTED',
    message: 'Batch warm-up started for all eligible families'
  });

  // Execute asynchronously
  runAllWarmups(supabase).then(() => {
    console.log('Batch warm-up completed');
  }).catch(err => {
    console.error('Batch warm-up failed:', err);
  });
});

// --- AUTOMATION CONTROL ROUTES ---

// Valid switch names
const AUTOMATION_SWITCHES = ['bestbehavior_enabled', 'commenting_enabled', 'contentposting_enabled', 'dm_enabled'];

// Toggle a specific automation switch for a family
// POST /api/admin/automation/:familyId { switch: 'bestbehavior_enabled', enabled: true }
app.post('/api/admin/automation/:familyId', basicAuth, async (req, res) => {
  const { familyId } = req.params;
  const { switch: switchName, enabled } = req.body;

  // Validate switch name
  if (!switchName || !AUTOMATION_SWITCHES.includes(switchName)) {
    return res.status(400).json({
      error: `Invalid switch. Must be one of: ${AUTOMATION_SWITCHES.join(', ')}`
    });
  }

  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'enabled must be a boolean (true/false)' });
  }

  if (!supabase) return res.status(500).json({ error: 'Supabase not configured' });

  try {
    const { data: family, error: fetchError } = await supabase
      .from('families')
      .select('name, ig_username, instagram_handle')
      .eq('id', familyId)
      .single();

    if (fetchError || !family) {
      return res.status(404).json({ error: 'Family not found' });
    }

    // Build dynamic update
    const updateData = { [switchName]: enabled };

    const { error } = await supabase
      .from('families')
      .update(updateData)
      .eq('id', familyId);

    if (error) throw error;

    const account = family.ig_username || family.instagram_handle || 'no account';
    console.log(`${switchName} ${enabled ? 'ENABLED' : 'DISABLED'} for family ${familyId} (@${account})`);

    res.json({
      status: 'SUCCESS',
      family_id: familyId,
      family_name: family.name,
      switch: switchName,
      enabled: enabled,
      message: `${switchName} ${enabled ? 'enabled' : 'disabled'} for ${family.name}`
    });
  } catch (e) {
    console.error('Toggle automation error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Bulk toggle all switches for a family
// POST /api/admin/automation/:familyId/bulk { bestbehavior_enabled: true, commenting_enabled: false, ... }
app.post('/api/admin/automation/:familyId/bulk', basicAuth, async (req, res) => {
  const { familyId } = req.params;

  if (!supabase) return res.status(500).json({ error: 'Supabase not configured' });

  try {
    const { data: family, error: fetchError } = await supabase
      .from('families')
      .select('name, ig_username, instagram_handle')
      .eq('id', familyId)
      .single();

    if (fetchError || !family) {
      return res.status(404).json({ error: 'Family not found' });
    }

    // Filter only valid switches from request body
    const updateData = {};
    for (const switchName of AUTOMATION_SWITCHES) {
      if (typeof req.body[switchName] === 'boolean') {
        updateData[switchName] = req.body[switchName];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No valid switches provided' });
    }

    const { error } = await supabase
      .from('families')
      .update(updateData)
      .eq('id', familyId);

    if (error) throw error;

    const account = family.ig_username || family.instagram_handle || 'no account';
    console.log(`Bulk update for family ${familyId} (@${account}):`, updateData);

    res.json({
      status: 'SUCCESS',
      family_id: familyId,
      family_name: family.name,
      updated_switches: updateData
    });
  } catch (e) {
    console.error('Bulk toggle error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Toggle Instagram password field access for a family
// POST /api/admin/instagram-password/:familyId { enabled: true }
app.post('/api/admin/instagram-password/:familyId', adminAuth, async (req, res) => {
  const { familyId } = req.params;
  const { enabled } = req.body;

  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'enabled must be a boolean (true/false)' });
  }

  if (!supabase) return res.status(500).json({ error: 'Supabase not configured' });

  try {
    const { data: family, error: fetchError } = await supabase
      .from('families')
      .select('name, instagram_handle')
      .eq('id', familyId)
      .single();

    if (fetchError || !family) {
      return res.status(404).json({ error: 'Family not found' });
    }

    const { error: updateError } = await supabase
      .from('families')
      .update({ instagram_password_enabled: enabled })
      .eq('id', familyId);

    if (updateError) throw updateError;

    res.json({
      success: true,
      family_id: familyId,
      family_name: family.name,
      instagram_password_enabled: enabled
    });
  } catch (e) {
    console.error('Instagram password toggle error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Get automation status for all families
app.get('/api/admin/automation/status', basicAuth, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Supabase not configured' });

  try {
    const { data, error } = await supabase
      .from('families')
      .select('id, name, instagram_handle, ig_username, ig_account_status, bestbehavior_enabled, commenting_enabled, contentposting_enabled, dm_enabled')
      .order('id', { ascending: true });

    if (error) throw error;

    const status = data.map(family => ({
      id: family.id,
      name: family.name,
      original_account: family.instagram_handle,
      synthetic_account: family.ig_username,
      ig_status: family.ig_account_status,
      switches: {
        bestbehavior_enabled: family.bestbehavior_enabled || false,
        commenting_enabled: family.commenting_enabled || false,
        contentposting_enabled: family.contentposting_enabled || false,
        dm_enabled: family.dm_enabled || false
      },
      active_modes: [
        family.bestbehavior_enabled && ['created', 'warming_up'].includes(family.ig_account_status) ? 'WARM_UP' : null,
        family.commenting_enabled && family.ig_account_status === 'active' ? 'COMMENTING' : null,
        family.contentposting_enabled ? 'CONTENT_POSTING' : null,
        family.dm_enabled ? 'DM' : null
      ].filter(Boolean)
    }));

    res.json(status);
  } catch (e) {
    console.error('Automation status error:', e);
    res.status(500).json({ error: e.message });
  }
});

// API: Trigger Automation (Manual Run)
app.post('/api/trigger', basicAuth, async (req, res) => {
  const { username } = req.body;
  console.log(`Triggering automation for ${username}...`);

  if (!supabase) return res.status(500).json({ error: 'Supabase not configured' });

  try {
    // 1. Get cookies and location config from DB
    const { data, error } = await supabase
      .from('families')
      .select('cookies, proxy_city, proxy_country, timezone, geo_latitude, geo_longitude')
      .eq('instagram_handle', username)
      .single();

    if (error || !data || !data.cookies) {
      return res.status(400).json({ error: 'No credentials found for this family' });
    }

    // 2. Decrypt cookies
    let cookies;
    try {
      const decryptedString = decrypt(data.cookies);
      cookies = JSON.parse(decryptedString);
    } catch (e) {
      return res.status(500).json({ error: 'Failed to decrypt cookies' });
    }

    // 3. Prepare location config
    const locationConfig = {
      proxy_city: data.proxy_city,
      proxy_country: data.proxy_country,
      timezone: data.timezone,
      geo_latitude: data.geo_latitude,
      geo_longitude: data.geo_longitude
    };

    // 4. Run Automation (Background)
    // We don't await the whole process so the UI doesn't hang
    (async () => {
      // Pass username as sessionId for unique proxy session per family
      const sessionId = `family-${username}`;
      const bot = new InstagramAutomation(cookies, null, { server: 'proxy' }, sessionId, locationConfig);
      try {
        await bot.init();

        // Bandwidth-optimized scrolling (default 15s instead of 30s)
        // With Data Saver mode: 15s = ~4MB, 30s = ~8MB
        // Adjust via SCROLL_DURATION_MS env var if needed
        const scrollDuration = parseInt(process.env.SCROLL_DURATION_MS) || 15000;
        await bot.scrollFeed(scrollDuration);

        await bot.likeRandomPosts(3);
        console.log(`Automation finished for ${username}`);
      } catch (e) {
        console.error(`Automation failed for ${username}:`, e);
      } finally {
        await bot.close();
      }
    })();

    return res.json({ status: 'STARTED', message: 'Automation started in background' });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// --- AUTOMATION SCHEDULER ---

// Target accounts to monitor for new posts
const TARGET_ACCOUNTS = [
  'eye.on.palestine',
  'unicef',
  'globalsumudflotilla',
  'wearthepeace',
  'palestine.pixel',
  'landpalestine',
  'gazafreedomflotilla',
  'europe.palestine.network',
  'translating_falasteen',
  'humantiproject',
  'letstalkpalestine',
  'palestinianvideos',
  'wonderful_palestine',
  'palestinesolidarityuk',
  'james_unicef',
  'worldfoodprogramme',
  'unrwa',
  'wissamgaza',
  'thousandmadleenstogaza',
  'unicef_mena',
  'gretathunberg',
  'ajplus',
  'middleeastmonitor',
  'doctorswithoutborders',
  'palestinianyouthmovement',
  'israelscrimes',
  'amnesty',
  'theintercept',
  'aljazeera',
  'hiddenpalestine.archive',
  'pal_freepalestine',
  'nouraerakat',
  'palestinesolidaritymvmt',
  'nowinpalestine',
  'hinds.call',
  'everydaypalestinee2',
  'untoldpalestine',
  'gaza24live',
  'actionmtl',
  'palfest',
  'gameover.israel',
  'stand4palestineaus',
  'call2actionnow'
];

// --- COMMENT SCHEDULER ---
// Uses curated comment templates with day-specific scheduling
// Target accounts and schedules are stored in database (see Migration 10)

let commentScheduler = null;
let engagementTracker = null;

// Initialize schedulers after Supabase is ready
setTimeout(() => {
  if (supabase) {
    console.log('[Scheduler] Initializing Comment Scheduler...');
    commentScheduler = new CommentScheduler(supabase, InstagramAutomation);
    commentScheduler.start().catch(err => {
      console.error('[Scheduler] Comment scheduler error:', err.message);
    });

    console.log('[Scheduler] Initializing Engagement Tracker...');
    engagementTracker = new EngagementTracker(supabase, InstagramAutomation);
    engagementTracker.start();
  } else {
    console.log('[Scheduler] Supabase not connected, schedulers disabled');
  }
}, 5000); // Wait 5s for Supabase connection

// API endpoint to manually trigger a comment round (for testing)
app.post('/api/admin/scheduler/trigger', basicAuth, async (req, res) => {
  if (!commentScheduler) {
    return res.status(500).json({ error: 'Scheduler not initialized' });
  }

  try {
    await commentScheduler.triggerManual();
    res.json({ status: 'SUCCESS', message: 'Comment round triggered' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API endpoint to manually trigger engagement check (for testing)
app.post('/api/admin/engagement/trigger', basicAuth, async (req, res) => {
  if (!engagementTracker) {
    return res.status(500).json({ error: 'Engagement tracker not initialized' });
  }

  try {
    await engagementTracker.triggerManual();
    res.json({ status: 'SUCCESS', message: 'Engagement check triggered' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- WARM-UP SCHEDULER ---
// Run warm-up sessions once per day (every 24 hours)
// Staggers sessions across families with 5-15 min gaps

// Calculate ms until next 6 AM UTC (good time to run warm-ups)
function msUntilNextWarmupWindow() {
  const now = new Date();
  const target = new Date(now);
  target.setUTCHours(6, 0, 0, 0);

  // If it's past 6 AM UTC today, schedule for tomorrow
  if (now >= target) {
    target.setDate(target.getDate() + 1);
  }

  return target - now;
}

// Schedule first warm-up run at next 6 AM UTC
setTimeout(() => {
  console.log('🔥 Starting daily warm-up scheduler...');

  // Run immediately for the first time
  if (supabase) {
    runAllWarmups(supabase).catch(err => {
      console.error('Warm-up scheduler error:', err);
    });
  }

  // Then run every 24 hours
  setInterval(() => {
    console.log('🔥 Daily warm-up scheduler triggered');
    if (supabase) {
      runAllWarmups(supabase).catch(err => {
        console.error('Warm-up scheduler error:', err);
      });
    }
  }, 24 * 60 * 60 * 1000); // 24 hours

}, msUntilNextWarmupWindow());

console.log(`🔥 Warm-up scheduler: First run in ${Math.round(msUntilNextWarmupWindow() / (1000 * 60 * 60))} hours`);

// --- PORTAL API ---

// Translation endpoint (uses DeepL)
app.post('/api/translate', portalAuth, async (req, res) => {
  const { text, targetLang } = req.body;

  if (!translator) {
    return res.status(503).json({ error: 'Translation service not configured' });
  }

  if (!text || !text.trim()) {
    return res.json({ translation: text, detectedLang: null });
  }

  try {
    // Auto-detect source language and translate
    const result = await translator.translateText(
      text,
      null, // Auto-detect source language
      targetLang === 'ar' ? 'ar' : 'en-US'
    );

    res.json({
      translation: result.text,
      detectedLang: result.detectedSourceLang
    });
  } catch (error) {
    console.error('Translation error:', error);
    res.status(500).json({ error: 'Translation failed', original: text });
  }
});

// Transliteration endpoint (phonetic, not semantic)
const latinToArabicMap = {
  'th': 'ث', 'sh': 'ش', 'kh': 'خ', 'dh': 'ذ', 'gh': 'غ', 'ch': 'تش',
  'ph': 'ف', 'oo': 'و', 'ee': 'ي', 'ou': 'و', 'aa': 'ا', 'ai': 'اي',
  'ei': 'اي', 'au': 'او', 'aw': 'او',
  'a': 'ا', 'b': 'ب', 'c': 'ك', 'd': 'د', 'e': 'ي', 'f': 'ف',
  'g': 'غ', 'h': 'ه', 'i': 'ي', 'j': 'ج', 'k': 'ك', 'l': 'ل',
  'm': 'م', 'n': 'ن', 'o': 'و', 'p': 'ب', 'q': 'ق', 'r': 'ر',
  's': 'س', 't': 'ت', 'u': 'و', 'v': 'ف', 'w': 'و', 'x': 'كس',
  'y': 'ي', 'z': 'ز'
};

function latinToArabic(text) {
  let result = '';
  const lower = text.toLowerCase();
  let i = 0;
  while (i < lower.length) {
    if (i + 1 < lower.length) {
      const pair = lower.substring(i, i + 2);
      if (latinToArabicMap[pair]) {
        result += latinToArabicMap[pair];
        i += 2;
        continue;
      }
    }
    const ch = lower[i];
    result += latinToArabicMap[ch] || ch;
    i++;
  }
  return result;
}

app.post('/api/transliterate', portalAuth, async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) {
    return res.json({ transliteration: text });
  }

  try {
    const isArabic = /[\u0600-\u06FF]/.test(text);
    if (isArabic) {
      res.json({ transliteration: transliterate(text) });
    } else {
      res.json({ transliteration: latinToArabic(text) });
    }
  } catch (error) {
    console.error('Transliteration error:', error);
    res.json({ transliteration: text });
  }
});

// Portal Register
app.post('/api/portal/register', async (req, res) => {
  const { password, family_name, instagram_handle } = req.body;
  const email = req.body.email.toLowerCase();

  if (!supabase) return res.status(500).json({ error: 'Database not connected' });

  // Instagram handle is mandatory
  if (!instagram_handle || !instagram_handle.trim()) {
    return res.status(400).json({ error: 'Instagram username is required | حساب انستغرام مطلوب' });
  }

  // Check if email exists
  const { data: existing } = await supabase.from('families').select('email').eq('email', email).single();
  if (existing) return res.status(400).json({ error: 'Email already registered' });

  const { data, error } = await supabase
    .from('families')
    .insert([{
      email,
      password: crypto.createHash('sha256').update(password).digest('hex'),
      name: family_name,
      instagram_handle: instagram_handle.replace(/^@/, '').trim(),
      status: 'active'
    }])
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  // Auto login
  const token = crypto.randomBytes(16).toString('hex');
  portalSessions.set(token, data);

  res.json({ status: 'SUCCESS', token, user: data });
});

// Portal Login
app.post('/api/portal/login', async (req, res) => {
  const { password } = req.body;
  const email = req.body.email.toLowerCase();
  
  if (!supabase) return res.status(500).json({ error: 'Database not connected' });

  // Check credentials in families table
  const { data, error } = await supabase
    .from('families')
    .select('*')
    .eq('email', email)
    .eq('password', crypto.createHash('sha256').update(password).digest('hex'))
    .single();

  if (error || !data) {
    return res.status(401).json({ error: 'Invalid portal credentials' });
  }

  // Generate simple session token
  const token = crypto.randomBytes(16).toString('hex');
  portalSessions.set(token, data);

  res.json({ status: 'SUCCESS', token, user: { 
    email: data.email,
    handle: data.instagram_handle,
    housing: data.housing_type,
    children: data.children_count
  }});
});

// Get Profile
app.get('/api/portal/me', portalAuth, async (req, res) => {
  const { data } = await supabase
    .from('families')
    .select('*')
    .eq('email', req.user.email)
    .single();
  
  res.json(data);
});

// Update Profile
app.post('/api/portal/profile', portalAuth, async (req, res) => {
  const updates = req.body;
  
  // Whitelist allowed fields
  const allowed = ['housing_type', 'displacement_count', 'children_count', 'children_details', 'medical_conditions', 'facing_cold', 'facing_hunger', 'urgent_need', 'urgent_needs', 'urgent_need_amount', 'palpay_phone', 'palpay_name', 'gaza_zone', 'religion'];
  const cleanUpdates = {};
  
  Object.keys(updates).forEach(key => {
    if (allowed.includes(key)) cleanUpdates[key] = updates[key];
  });

  const { error } = await supabase
    .from('families')
    .update(cleanUpdates)
    .eq('email', req.user.email);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ status: 'SUCCESS' });
});

// Upload Media
app.post('/api/portal/upload', portalAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const fileExt = req.file.originalname.split('.').pop();
  const userFolder = req.user.instagram_handle || req.user.email.replace(/[^a-z0-9]/gi, '_');
  const fileName = `${userFolder}/${Date.now()}.${fileExt}`;
  const description = req.body.description || '';

  try {
    let filePath = fileName;
    let b2Url = null;

    // Use B2 if configured (no size limits), otherwise Supabase storage
    if (isB2Configured()) {
      console.log(`[Upload] Using B2 for family ${req.user.id}`);
      const b2Result = await uploadFamilyMedia(
        req.file.buffer,
        req.user.id,
        req.file.originalname,
        req.file.mimetype
      );
      filePath = b2Result.key;
      b2Url = b2Result.url;
    } else {
      // Fallback to Supabase storage
      const { data: storageData, error: storageError } = await supabase
        .storage
        .from('media')
        .upload(fileName, req.file.buffer, {
          contentType: req.file.mimetype
        });

      if (storageError) throw storageError;
    }

    // Insert into DB (media_uploads)
    const { error: dbError } = await supabase
      .from('media_uploads')
      .insert([{
        family_id: req.user.id,
        file_path: filePath,
        b2_url: b2Url, // Will be null if using Supabase storage
        description: description
      }]);

    if (dbError) {
      console.error('DB Insert Error:', dbError);
      // Cleanup storage on failure
      if (b2Url) {
        await deleteFromB2(filePath);
      } else {
        await supabase.storage.from('media').remove([fileName]);
      }
      throw dbError;
    }

    // Return the accessible URL so frontend can use it immediately
    let publicUrl = b2Url;
    if (!publicUrl) {
      const { data: signed } = await supabase
        .storage
        .from('media')
        .createSignedUrl(filePath, 60 * 60 * 24 * 7); // 7-day URL
      publicUrl = signed?.signedUrl;
    }

    res.json({ status: 'SUCCESS', path: filePath, b2: !!b2Url, url: publicUrl });
  } catch (e) {
    console.error('Upload error:', e);
    res.status(500).json({ error: 'Upload failed: ' + e.message });
  }
});

// Helper to guess mime type from extension (since we don't store it in DB yet)
const getMimeType = (path) => {
    const ext = path.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'image/' + ext;
    if (['mp4', 'mov', 'webm'].includes(ext)) return 'video/' + ext;
    return 'application/octet-stream';
};

// List Media (From Database)
app.get('/api/portal/media', portalAuth, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Supabase not configured' });

  try {
    // 1. Get records from DB for this family
    const { data: dbFiles, error: dbError } = await supabase
      .from('media_uploads')
      .select('*')
      .eq('family_id', req.user.id)
      .order('created_at', { ascending: false });

    if (dbError) throw dbError;

    // 2. Generate URLs - use B2 URL if available, otherwise Supabase signed URL
    const filesWithUrls = await Promise.all(dbFiles.map(async (file) => {
      let url;

      // Use B2 URL directly if available (permanent, no signing needed)
      if (file.b2_url) {
        url = file.b2_url;
      } else {
        // Fallback to Supabase signed URL
        const { data: signed } = await supabase
          .storage
          .from('media')
          .createSignedUrl(file.file_path, 60 * 60); // 1 hour URL
        url = signed?.signedUrl;
      }

      // Map to frontend structure
      const name = file.file_path.split('/').pop();
      return {
        id: file.id,
        name: name,
        fullPath: file.file_path,
        url: url,
        isB2: !!file.b2_url,
        metadata: {
            mimetype: getMimeType(file.file_path),
            description: file.description
        },
        created_at: file.created_at
      };
    }));

    res.json(filesWithUrls);
  } catch (e) {
    console.error('List media error:', e);
    res.status(500).json({ error: 'Failed to list media' });
  }
});

// Update Media Description
app.post('/api/portal/media/update', portalAuth, async (req, res) => {
    const { id, description } = req.body;
    if (!id) return res.status(400).json({ error: 'Media ID required' });

    try {
        const { error } = await supabase
            .from('media_uploads')
            .update({ description })
            .eq('id', id)
            .eq('family_id', req.user.id); // Security: Ensure ownership

        if (error) throw error;
        res.json({ status: 'SUCCESS' });
    } catch (e) {
        console.error('Update media error:', JSON.stringify(e, null, 2));
        res.status(500).json({ error: 'Failed to update media: ' + (e.message || 'Unknown error') });
    }
});

// Delete Media
app.post('/api/portal/media/delete', portalAuth, async (req, res) => {
  const { id, fileName } = req.body;
  // Support both ID (new way) and fileName (legacy/backup)

  if (!supabase) return res.status(500).json({ error: 'Supabase not configured' });

  try {
    let filePath = fileName;
    let b2Url = null;

    // If ID provided, get path and b2_url from DB first
    if (id) {
        const { data: fileRow } = await supabase
            .from('media_uploads')
            .select('file_path, b2_url')
            .eq('id', id)
            .eq('family_id', req.user.id)
            .single();

        if (fileRow) {
          filePath = fileRow.file_path;
          b2Url = fileRow.b2_url;
        }
    } else {
        // Fallback construct path
        const userFolder = req.user.instagram_handle || req.user.email.replace(/[^a-z0-9]/gi, '_');
        filePath = `${userFolder}/${fileName}`;
    }

    if (!filePath) return res.status(404).json({ error: 'File not found' });

    // 1. Delete from DB
    const { error: dbError } = await supabase
        .from('media_uploads')
        .delete()
        .eq('file_path', filePath)
        .eq('family_id', req.user.id);

    if (dbError) console.error('DB Delete Warning:', dbError);

    // 2. Delete from Storage (B2 or Supabase)
    if (b2Url) {
      // Delete from B2
      await deleteFromB2(filePath);
    } else {
      // Delete from Supabase storage
      const { error: storageError } = await supabase
        .storage
        .from('media')
        .remove([filePath]);

      if (storageError) console.error('Storage Delete Warning:', storageError);
    }

    res.json({ status: 'SUCCESS' });
  } catch (e) {
    console.error('Delete media error:', e);
    res.status(500).json({ error: 'Failed to delete media' });
  }
});

// Forgot Password - Request Token
app.post('/api/portal/forgot-password', async (req, res) => {
  const email = req.body.email.toLowerCase();
  if (!supabase) return res.status(500).json({ error: 'Database not connected' });

  try {
    // Check if user exists (silently fail if not to prevent enumeration)
    const { data: user, error: userError } = await supabase.from('families').select('email').eq('email', email).single();
    
    if (userError && userError.code !== 'PGRST116') { // PGRST116 is "No rows found"
        throw userError;
    }

    if (user) {
        // Generate Token
        const token = crypto.randomBytes(32).toString('hex');
        const expires = new Date(Date.now() + 3600000); // 1 hour from now

        // Save to DB
        const { error: updateError } = await supabase
        .from('families')
        .update({ reset_token: token, reset_expires: expires.toISOString() })
        .eq('email', email);

        if (updateError) throw updateError;

        // Generate Reset Link
        const resetLink = `${req.protocol}://${req.get('host')}/?token=${token}`;
        
        // EMAIL SENDING LOGIC
        // Check if email service is configured
        const isEmailConfigured = (process.env.SMTP_HOST && process.env.SMTP_USER) || process.env.RESEND_API_KEY;

        if (isEmailConfigured) {
            // Run email sending asynchronously so we don't block the UI response
            // This prevents the "stuck" processing icon if email service is slow/down
            (async () => {
                try {
                    const isResend = !!process.env.RESEND_API_KEY;
                    const fromAddress = process.env.SMTP_FROM || (isResend ? 'onboarding@resend.dev' : '"Gaza Protocol" <noreply@example.com>');

                    console.log(`📧 Attempting to send password reset email to ${email}...`);
                    await transporter.sendMail({
                        from: fromAddress,
                        to: email,
                        subject: 'Password Reset Request',
                        html: `<p>You requested a password reset.</p><p>Click here to reset: <a href="${resetLink}">${resetLink}</a></p>`,
                    });
                    console.log(`✅ Email sent successfully to ${email}`);
                } catch (emailError) {
                    console.error('❌ Failed to send email (check SMTP/Resend config):', emailError.message);
                }
            })();
        } else {
            // Fallback: Log to console for development/testing
            console.log(`\n📧 [EMAIL MOCK] Password Reset Request for ${email}`);
            console.log(`🔗 Link: ${resetLink}\n`);
        }
    }

    // Always return success for security
    res.json({ status: 'SUCCESS', message: 'If an account exists, a reset link has been sent.' });

  } catch (e) {
      console.error('Forgot password error:', e);
      res.status(500).json({ error: 'Internal server error processing request' });
  }
});

// Reset Password - Verify Token & Update
app.post('/api/portal/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  if (!supabase) return res.status(500).json({ error: 'Database not connected' });

  // Find user with valid token
  const { data: user, error } = await supabase
    .from('families')
    .select('email')
    .eq('reset_token', token)
    .gt('reset_expires', new Date().toISOString())
    .single();

  if (error || !user) return res.status(400).json({ error: 'Invalid or expired token' });

  // Update Password
  const hashedPassword = crypto.createHash('sha256').update(newPassword).digest('hex');
  
  const { error: updateError } = await supabase
    .from('families')
    .update({ password: hashedPassword, reset_token: null, reset_expires: null })
    .eq('email', user.email);

  if (updateError) return res.status(500).json({ error: updateError.message });

  res.json({ status: 'SUCCESS' });
});

// --- APIFY INSTAGRAM SCRAPER API ---

// Check if Instagram account is public (pre-scrape validation)
app.post('/api/portal/instagram/check-public', portalAuth, async (req, res) => {
  const { username } = req.body;

  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }

  console.log(`[Apify] Checking if @${username} is public...`);

  try {
    const result = await checkAccountPublic(username);

    if (!result.isPublic) {
      return res.status(400).json({
        error: result.error || 'Account is private or not found',
        isPublic: false
      });
    }

    res.json({
      isPublic: true,
      username: result.profileData?.username || username,
      fullName: result.profileData?.fullName,
      profilePicUrl: result.profileData?.profilePicUrl,
      followersCount: result.profileData?.followersCount
    });
  } catch (e) {
    console.error('[Apify] Check public error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Scrape Instagram profile (with 24-hour cooldown)
app.post('/api/portal/instagram/scrape', portalAuth, async (req, res) => {
  const { username } = req.body;
  const familyId = req.user.id;

  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }

  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  console.log(`[Apify] Scrape request for @${username} by family ${familyId}`);

  try {
    // 1. Check 24-hour cooldown
    const cooldownCheck = await checkScrapeCooldown(supabase, familyId);
    if (!cooldownCheck.canScrape) {
      return res.status(429).json({
        error: cooldownCheck.error,
        minutesRemaining: cooldownCheck.minutesRemaining,
        cooldown: true
      });
    }

    // 2. Verify account is public first
    console.log(`[Apify] Checking if @${username} is public...`);
    const publicCheck = await checkAccountPublic(username);
    if (!publicCheck.isPublic) {
      console.log(`[Apify] Public check failed for @${username}: ${publicCheck.error}`);
      return res.status(400).json({
        error: publicCheck.error || 'Account is private. Only public accounts can be scraped.',
        isPublic: false
      });
    }
    console.log(`[Apify] @${username} is public, starting full scrape...`);

    // 3. Start the scrape (this may take 1-3 minutes)
    res.json({
      status: 'STARTED',
      message: `Scraping @${username}. This may take a few minutes...`
    });

    // Run scrape in background and save results
    (async () => {
      try {
        const scrapeResult = await scrapeProfile(username, 50);

        if (scrapeResult.error) {
          console.error(`[Apify] Scrape failed for @${username}:`, scrapeResult.error);
          return;
        }

        // Save to database
        const saveResult = await saveScrapedData(supabase, familyId, scrapeResult);

        if (saveResult.success) {
          console.log(`[Apify] Scrape complete for @${username}: ${saveResult.contentSaved} posts saved`);
        } else {
          console.error(`[Apify] Save failed for @${username}:`, saveResult.error);
        }
      } catch (err) {
        console.error(`[Apify] Background scrape error for @${username}:`, err);
      }
    })();

  } catch (e) {
    console.error('[Apify] Scrape error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Get scraped profile data for current family
app.get('/api/portal/instagram/profile', portalAuth, async (req, res) => {
  const familyId = req.user.id;

  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  try {
    // Get profile data
    const { data: profile, error: profileError } = await supabase
      .from('mothers_profiles')
      .select('*')
      .eq('family_id', familyId)
      .single();

    if (profileError && profileError.code !== 'PGRST116') {
      throw profileError;
    }

    // Get content count
    const { count: contentCount } = await supabase
      .from('mothers_content')
      .select('*', { count: 'exact', head: true })
      .eq('family_id', familyId);

    // Calculate cooldown status (2 minutes for testing, change to 1440 for production)
    const COOLDOWN_MINUTES = 2;
    let canScrape = true;
    let minutesRemaining = 0;

    if (profile?.last_scraped_at) {
      const lastScraped = new Date(profile.last_scraped_at);
      const minutesSince = (Date.now() - lastScraped.getTime()) / (1000 * 60);
      if (minutesSince < COOLDOWN_MINUTES) {
        canScrape = false;
        minutesRemaining = Math.ceil(COOLDOWN_MINUTES - minutesSince);
      }
    }

    console.log(`[Profile API] Returning profile for family ${familyId}: pic_url=${profile?.profile_pic_url || 'NONE'}`);
    res.json({
      profile: profile || null,
      contentCount: contentCount || 0,
      canScrape,
      minutesRemaining,
      lastScrapedAt: profile?.last_scraped_at || null
    });
  } catch (e) {
    console.error('[Apify] Get profile error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Unlink Instagram account (reset to virgin state)
app.post('/api/portal/instagram/unlink', portalAuth, async (req, res) => {
  const familyId = req.user.id;

  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  console.log(`[Unlink] Unlinking Instagram for family ${familyId}`);

  try {
    // 1. Delete scraped content
    const { error: contentError } = await supabase
      .from('mothers_content')
      .delete()
      .eq('family_id', familyId);

    if (contentError) {
      console.log('[Unlink] Content delete warning:', contentError.message);
    }

    // 2. Delete scraped profile
    const { error: profileError } = await supabase
      .from('mothers_profiles')
      .delete()
      .eq('family_id', familyId);

    if (profileError) {
      console.log('[Unlink] Profile delete warning:', profileError.message);
    }

    // 3. Reset family record
    const { error: familyError } = await supabase
      .from('families')
      .update({
        instagram_handle: null,
        ig_profile_scraped: false,
        profile_pic_url: null
      })
      .eq('id', familyId);

    if (familyError) {
      throw familyError;
    }

    console.log(`[Unlink] Successfully unlinked Instagram for family ${familyId}`);

    res.json({
      status: 'SUCCESS',
      message: 'Instagram account unlinked successfully'
    });
  } catch (e) {
    console.error('[Unlink] Error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Get scraped content for current family
app.get('/api/portal/instagram/content', portalAuth, async (req, res) => {
  const familyId = req.user.id;
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const offset = parseInt(req.query.offset) || 0;

  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  try {
    const { data: content, error } = await supabase
      .from('mothers_content')
      .select('*')
      .eq('family_id', familyId)
      .order('posted_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    res.json({ content: content || [], limit, offset });
  } catch (e) {
    console.error('[Apify] Get content error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Update scraped content description (for AI context)
app.post('/api/portal/instagram/content/update', portalAuth, async (req, res) => {
  const familyId = req.user.id;
  const { id, description } = req.body;

  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  if (!id) {
    return res.status(400).json({ error: 'Content ID required' });
  }

  try {
    // Verify the content belongs to this family
    const { data: content, error: fetchError } = await supabase
      .from('mothers_content')
      .select('id, family_id')
      .eq('id', id)
      .single();

    if (fetchError || !content) {
      return res.status(404).json({ error: 'Content not found' });
    }

    if (content.family_id !== familyId) {
      return res.status(403).json({ error: 'Not authorized to edit this content' });
    }

    // Update description
    const { error: updateError } = await supabase
      .from('mothers_content')
      .update({ description: description || null })
      .eq('id', id);

    if (updateError) throw updateError;

    console.log(`[Content] Updated description for content ${id} by family ${familyId}`);
    res.json({ status: 'SUCCESS' });

  } catch (e) {
    console.error('[Content] Update error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Portal: Backup engaged followers (likers/commenters)
app.post('/api/portal/instagram/backup-followers', portalAuth, async (req, res) => {
  const familyId = req.user.id;
  const { postsToScan = 10 } = req.body;

  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  try {
    // Get family's Instagram handle
    const { data: family, error: familyError } = await supabase
      .from('families')
      .select('id, name, instagram_handle')
      .eq('id', familyId)
      .single();

    if (familyError || !family) {
      return res.status(404).json({ error: 'Family not found' });
    }

    if (!family.instagram_handle) {
      return res.status(400).json({ error: 'No Instagram account linked. Please scrape your profile first.' });
    }

    console.log(`[Portal] Starting followers backup for family ${family.name} (@${family.instagram_handle})`);

    // Scrape engaged followers from recent posts
    const scrapeResult = await scrapeEngagedFollowers(family.instagram_handle, postsToScan);

    if (scrapeResult.error) {
      console.error(`[Portal] Followers backup failed: ${scrapeResult.error}`);
      return res.status(500).json({ error: scrapeResult.error });
    }

    // Save to database
    const saveResult = await saveEngagedFollowers(supabase, familyId, scrapeResult.engagedFollowers);

    if (saveResult.error) {
      return res.status(500).json({ error: saveResult.error });
    }

    console.log(`[Portal] Followers backup complete: ${saveResult.saved} engaged followers saved`);

    res.json({
      success: true,
      postsScanned: scrapeResult.postsScanned,
      engagedFollowersSaved: saveResult.saved,
      scrapedAt: scrapeResult.scrapedAt,
    });

  } catch (e) {
    console.error('[Portal] Backup followers error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Portal: Get engaged followers count
app.get('/api/portal/instagram/engaged-followers-count', portalAuth, async (req, res) => {
  const familyId = req.user.id;

  if (!supabase) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  try {
    const { count, error } = await supabase
      .from('engaged_followers')
      .select('*', { count: 'exact', head: true })
      .eq('family_id', familyId);

    if (error) throw error;

    res.json({ count: count || 0 });
  } catch (e) {
    console.error('[Portal] Engaged followers count error:', e);
    res.status(500).json({ error: e.message });
  }
});

// --- INSTAGRAM AUTH API ---

// API: Login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Missing credentials' });
  }

  // Check if this request comes from an authenticated portal user
  const token = req.headers['x-portal-token'];
  let portalUser = null;
  if (token && portalSessions.has(token)) {
    portalUser = portalSessions.get(token);
  }

  console.log(`Starting login session for ${username}`);

  // Try to fetch location config from database (for existing families)
  let locationConfig = null;
  if (supabase) {
    try {
      const { data } = await supabase
        .from('families')
        .select('proxy_city, proxy_country, timezone, geo_latitude, geo_longitude')
        .eq('instagram_handle', username)
        .single();

      if (data) {
        locationConfig = {
          proxy_city: data.proxy_city,
          proxy_country: data.proxy_country,
          timezone: data.timezone,
          geo_latitude: data.geo_latitude,
          geo_longitude: data.geo_longitude
        };
      }
    } catch (e) {
      // Family doesn't exist yet, will use env var defaults
      console.log(`No existing location config found for ${username}, using defaults`);
    }
  }

  // Pass username as sessionId for unique proxy session during login
  const sessionId = `login-${username}`;
  const bot = new InstagramAutomation([], null, { server: 'proxy' }, sessionId, locationConfig);

  try {
    await bot.init();
    
    // Store bot instance temporarily
    activeSessions.set(username, bot);

    const result = await bot.loginWithCredentials(username, password);

    if (result.status === 'SUCCESS') {
      // Encrypt and return cookies (or save to DB directly)
      const encryptedCookies = encrypt(JSON.stringify(result.cookies));
      
      // Save to Supabase if configured
      if (supabase) {
        console.log(`Saving session for ${username} to Supabase...`);
        
        let query;
        const updateData = { 
            cookies: encryptedCookies,
            last_login: new Date().toISOString(),
            status: 'active',
            instagram_handle: username, // Ensure handle is linked
            profile_pic_url: result.profilePicUrl
        };

        if (result.profilePicUrl && portalUser && portalUser.id) {
            try {
                console.log(`Downloading profile picture from ${result.profilePicUrl}`);
                const imageBuffer = await downloadImage(result.profilePicUrl);
                const filePath = `profile-pics/${portalUser.id}.jpg`;
                
                const { error: uploadError } = await supabase.storage
                    .from('media')
                    .upload(filePath, imageBuffer, {
                        contentType: 'image/jpeg',
                        upsert: true, // Overwrite if exists
                    });

                if (uploadError) {
                    console.error('Supabase profile picture upload error:', uploadError.message);
                } else {
                    const { data: publicUrlData } = supabase.storage
                        .from('media')
                        .getPublicUrl(filePath);
                    
                    if (publicUrlData && publicUrlData.publicUrl) {
                        // Add a timestamp to the URL to bypass caches if needed
                        updateData.profile_pic_url = `${publicUrlData.publicUrl}?t=${Date.now()}`;
                        console.log(`Profile picture saved to ${updateData.profile_pic_url}`);
                    }
                }
            } catch (downloadError) {
                console.error('Failed to download or save profile picture:', downloadError.message);
                // We proceed with the original (temporary) URL if download fails
            }
        }

        if (portalUser) {
            // Update the currently logged-in family's row
            // First, check if this handle is already taken by ANOTHER row
            const { data: existingHandles } = await supabase
                .from('families')
                .select('id, email')
                .eq('instagram_handle', username)
                .neq('email', portalUser.email)
                .limit(1);

            if (existingHandles && existingHandles.length > 0) {
                const existingHandle = existingHandles[0];
                console.log(`⚠️ Handle ${username} is claimed by another row. Merging/Overwriting...`);
                // Option A: Clear the handle from the old row to free it up
                await supabase.from('families').update({ instagram_handle: null }).eq('id', existingHandle.id);
                // Now update current user
                query = supabase.from('families').update(updateData).eq('email', portalUser.email);
            } else {
                // Normal update
                query = supabase.from('families').update(updateData).eq('email', portalUser.email);
            }
        } else {
            // Fallback: Update by handle (legacy/admin behavior)
            query = supabase.from('families').update(updateData).eq('instagram_handle', username);
        }

        const { error } = await query;
        
        if (error) console.error('❌ Supabase save error:', error.message);
        else console.log('✅ Session saved to database');
      }

      // Clean up browser
      await bot.close();
      activeSessions.delete(username);
      
      console.log('Cookies extracted and encrypted');
      
      return res.json({ 
        status: 'SUCCESS', 
        message: 'Connected successfully',
        encrypted_data: encryptedCookies 
      });
    }

    if (result.status === '2FA_REQUIRED') {
      return res.json({ status: '2FA_REQUIRED', username });
    }

    // Error
    await bot.close();
    activeSessions.delete(username);
    return res.status(401).json({ error: result.message || 'Login failed' });

  } catch (error) {
    console.error('Login error:', error);
    try { await bot.close(); } catch(e) {}
    activeSessions.delete(username);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

// --- ADMIN API ---

// Admin credentials from env (reuse N8N basic auth)
const ADMIN_USER = process.env.N8N_BASIC_AUTH_USER || 'admin';
const ADMIN_PASS = process.env.N8N_BASIC_AUTH_PASSWORD || '';

// Store admin sessions
const adminSessions = new Map();

// Generate simple admin token
function generateAdminToken() {
  return 'admin_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// Admin auth middleware
function adminAuth(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (!token || !adminSessions.has(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// Admin login
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;

  if (!ADMIN_PASS) {
    return res.status(500).json({ error: 'Admin not configured. Set N8N_BASIC_AUTH_PASSWORD.' });
  }

  if (username === ADMIN_USER && password === ADMIN_PASS) {
    const token = generateAdminToken();
    adminSessions.set(token, { username, createdAt: new Date() });
    // Clean up old tokens (keep max 10)
    if (adminSessions.size > 10) {
      const oldest = adminSessions.keys().next().value;
      adminSessions.delete(oldest);
    }
    return res.json({ token });
  }

  res.status(401).json({ error: 'Invalid credentials' });
});

// Admin: Get all families
app.get('/api/admin/families', adminAuth, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const { data, error } = await supabase
      .from('families')
      .select('id, name, email, instagram_handle, proxy_city, ig_account_status, cookies, instagram_password_enabled, bestbehavior_enabled, commenting_enabled, contentposting_enabled, dm_enabled, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Mask cookies and add transliterated names
    const sanitized = data.map(f => {
      let nameDisplay = f.name;
      if (f.name) {
        const isArabic = /[\u0600-\u06FF]/.test(f.name);
        if (isArabic) {
          nameDisplay = transliterate(f.name) + '  |  ' + f.name;
        } else {
          nameDisplay = f.name + '  |  ' + latinToArabic(f.name);
        }
      }
      return {
        ...f,
        cookies: f.cookies ? true : false,
        nameDisplay
      };
    });

    res.json(sanitized);
  } catch (e) {
    console.error('[Admin] Families error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Admin: Impersonate a family (view their dashboard as they see it)
app.post('/api/admin/impersonate/:familyId', adminAuth, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  const { familyId } = req.params;

  try {
    // Fetch the family's full data
    const { data: family, error } = await supabase
      .from('families')
      .select('*')
      .eq('id', familyId)
      .single();

    if (error || !family) {
      return res.status(404).json({ error: 'Family not found' });
    }

    // Generate an impersonation token (prefixed for easy identification)
    const token = 'imp_' + crypto.randomBytes(16).toString('hex');

    // Store in portal sessions (same as regular login)
    portalSessions.set(token, family);

    console.log(`[Admin] Impersonation token created for family ${family.name || family.id}`);

    res.json({
      success: true,
      token,
      familyName: family.name,
      familyEmail: family.email
    });

  } catch (e) {
    console.error('[Admin] Impersonate error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Admin: Delete a family and all associated data
app.delete('/api/admin/family/:familyId', adminAuth, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  const { familyId } = req.params;

  try {
    console.log(`[Admin] Deleting family ${familyId}...`);

    // Delete from dependent tables first (manual cascade)
    // Note: If foreign keys are set to CASCADE in DB, this is redundant but safe
    const tables = [
      'family_members',
      'media_uploads',
      'mothers_profiles',
      'mothers_content',
      'engaged_followers',
      'posted_comments',
      'comment_assignments',
      'comments_deployed'
    ];

    for (const table of tables) {
      const { error } = await supabase.from(table).delete().eq('family_id', familyId);
      if (error) console.log(`[Admin] Warning deleting from ${table}: ${error.message}`);
    }

    // Delete the family record itself
    const { error: familyError } = await supabase
      .from('families')
      .delete()
      .eq('id', familyId);

    if (familyError) throw familyError;

    console.log(`[Admin] Successfully deleted family ${familyId}`);
    res.json({ success: true, message: 'Family deleted successfully' });

  } catch (e) {
    console.error('[Admin] Delete family error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Admin: Get recent media uploads
app.get('/api/admin/media', adminAuth, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    // Get media with family name
    const { data, error } = await supabase
      .from('media_uploads')
      .select(`
        id, family_id, file_path, b2_url, description, created_at,
        families (name, email)
      `)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    // Format response with URLs
    const formatted = data.map(m => ({
      id: m.id,
      family_id: m.family_id,
      family_name: m.families?.name || m.families?.email,
      file_path: m.file_path,
      b2_url: m.b2_url,
      url: m.b2_url || null, // B2 URLs are public; Supabase would need signed URL
      description: m.description,
      created_at: m.created_at
    }));

    res.json(formatted);
  } catch (e) {
    console.error('[Admin] Media error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Admin: Get scrape status (using view)
app.get('/api/admin/scrapes', adminAuth, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const { data, error } = await supabase
      .from('profile_scrape_status')
      .select('*')
      .order('last_scraped_at', { ascending: false, nullsFirst: false });

    if (error) throw error;

    res.json(data || []);
  } catch (e) {
    console.error('[Admin] Scrapes error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Admin: Backup engaged followers (on-demand)
// Scrapes likers and commenters from a family's posts
app.post('/api/admin/backup-followers/:familyId', adminAuth, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  const { familyId } = req.params;
  const { postsToScan = 10 } = req.body;

  try {
    // Get family's Instagram handle
    const { data: family, error: familyError } = await supabase
      .from('families')
      .select('id, name, instagram_handle, last_followers_backup_at')
      .eq('id', familyId)
      .single();

    if (familyError || !family) {
      return res.status(404).json({ error: 'Family not found' });
    }

    if (!family.instagram_handle) {
      return res.status(400).json({ error: 'Family has no Instagram handle configured' });
    }

    console.log(`[Admin] Starting followers backup for family ${family.name} (@${family.instagram_handle})`);

    // Scrape engaged followers from recent posts
    const scrapeResult = await scrapeEngagedFollowers(family.instagram_handle, postsToScan);

    if (scrapeResult.error) {
      console.error(`[Admin] Followers backup failed: ${scrapeResult.error}`);
      return res.status(500).json({ error: scrapeResult.error });
    }

    // Save to database
    const saveResult = await saveEngagedFollowers(supabase, familyId, scrapeResult.engagedFollowers);

    if (saveResult.error) {
      return res.status(500).json({ error: saveResult.error });
    }

    console.log(`[Admin] Followers backup complete: ${saveResult.saved} engaged followers saved`);

    res.json({
      success: true,
      familyId,
      familyName: family.name,
      instagramHandle: family.instagram_handle,
      postsScanned: scrapeResult.postsScanned,
      engagedFollowersSaved: saveResult.saved,
      scrapedAt: scrapeResult.scrapedAt,
    });

  } catch (e) {
    console.error('[Admin] Backup followers error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Admin: Get engaged followers for a family
app.get('/api/admin/engaged-followers/:familyId', adminAuth, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  const { familyId } = req.params;

  try {
    const { data, error } = await supabase
      .from('engaged_followers')
      .select('*')
      .eq('family_id', familyId)
      .order('engagement_count', { ascending: false });

    if (error) throw error;

    res.json(data || []);
  } catch (e) {
    console.error('[Admin] Get engaged followers error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Admin: Get engaged followers summary for all families
app.get('/api/admin/engaged-followers-summary', adminAuth, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const { data, error } = await supabase
      .from('engaged_followers_summary')
      .select('*');

    if (error) throw error;

    res.json(data || []);
  } catch (e) {
    console.error('[Admin] Engaged followers summary error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Admin: Get dashboard stats
app.get('/api/admin/stats', adminAuth, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    // Total families
    const { count: totalFamilies } = await supabase
      .from('families')
      .select('*', { count: 'exact', head: true });

    // IG connected (has cookies or scraped profile)
    const { count: igConnected } = await supabase
      .from('families')
      .select('*', { count: 'exact', head: true })
      .or('cookies.neq.null,ig_profile_scraped.eq.true');

    // Total media uploads
    const { count: totalMedia } = await supabase
      .from('media_uploads')
      .select('*', { count: 'exact', head: true });

    // Active automation (any of the 4 switches enabled)
    const { count: automationActive } = await supabase
      .from('families')
      .select('*', { count: 'exact', head: true })
      .or('bestbehavior_enabled.eq.true,commenting_enabled.eq.true,contentposting_enabled.eq.true,dm_enabled.eq.true');

    res.json({
      totalFamilies: totalFamilies || 0,
      igConnected: igConnected || 0,
      totalMedia: totalMedia || 0,
      automationActive: automationActive || 0
    });
  } catch (e) {
    console.error('[Admin] Stats error:', e);
    res.status(500).json({ error: e.message });
  }
});

// API: 2FA
app.post('/api/2fa', async (req, res) => {
  const { username, code } = req.body;
  
  const bot = activeSessions.get(username);
  if (!bot) {
    return res.status(400).json({ error: 'Session expired. Please try again.' });
  }

  const result = await bot.submitTwoFactorCode(code);

  if (result.status === 'SUCCESS') {
    const encryptedCookies = encrypt(JSON.stringify(result.cookies));
    
    if (supabase) {
      console.log(`Saving session for ${username} to Supabase...`);
      const { error } = await supabase
        .from('families')
        .update({ 
          cookies: encryptedCookies,
          last_login: new Date().toISOString(),
          status: 'active'
        })
        .eq('instagram_handle', username);
        
      if (error) console.error('❌ Supabase save error:', error.message);
    }

    await bot.close();
    activeSessions.delete(username);
    
    return res.json({ 
      status: 'SUCCESS', 
      message: 'Connected successfully',
      encrypted_data: encryptedCookies 
    });
  }

  return res.status(400).json({ error: 'Invalid code' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('==================================================');
  console.log('   GAZA PROTOCOL SERVER STARTING (IPV4 FORCED)    ');
  console.log('==================================================');
  console.log(`Server running on http://0.0.0.0:${PORT}`);
  console.log(`Bound explicitly to 0.0.0.0 (IPv4) on port ${PORT}`);
  
  // Debug: Log Environment Variable Status (Masked)
  const apiKey = process.env.YOUCOM_API_KEY || '';
  const agentId = process.env.YOUCOM_AGENT_ID || '';
  console.log('🔑 Environment Check:');
  console.log(`   YOUCOM_API_KEY: ${apiKey ? apiKey.substring(0, 8) + '...' : 'NOT SET'}`);
  console.log(`   YOUCOM_AGENT_ID: ${agentId ? agentId : 'NOT SET'}`);

  const publicPath = path.join(__dirname, 'public');
  const indexPath = path.join(publicPath, 'index.html');

  if (!fs.existsSync(indexPath)) {
    console.log('⚠️  WARNING: public/index.html not found! Please ensure index.html is in the "public" folder.');
  }
});