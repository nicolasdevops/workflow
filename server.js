/**
 * Backend for Family Login Portal
 */

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const bodyParser = require('body-parser');
const multer = require('multer');
const nodemailer = require('nodemailer');
const { createClient } = require('@supabase/supabase-js');
const { InstagramAutomation } = require('./instagram-automation');
const { YouComAgent } = require('./youcom-agent');
const { encrypt, decrypt } = require('./encryption');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || process.env.N8N_PORT || 5678;

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

// Store active sessions in memory (in production, use Redis)
const activeSessions = new Map();

// Store portal sessions (simple token based)
const portalSessions = new Map();

// Configure Email Transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT || 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

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

// Admin Routes
app.get('/admin', basicAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
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

// API: Trigger Automation (Manual Run)
app.post('/api/trigger', basicAuth, async (req, res) => {
  const { username } = req.body;
  console.log(`Triggering automation for ${username}...`);

  if (!supabase) return res.status(500).json({ error: 'Supabase not configured' });

  try {
    // 1. Get cookies from DB
    const { data, error } = await supabase
      .from('families')
      .select('cookies')
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

    // 3. Run Automation (Background)
    // We don't await the whole process so the UI doesn't hang
    (async () => {
      const bot = new InstagramAutomation(cookies);
      try {
        await bot.init();
        await bot.scrollFeed(30000); // 30s scroll
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

// Run check every 60 minutes
setInterval(async () => {
  console.log('⏰ Scheduler: Starting hourly check...');
  
  if (!supabase) {
    console.log('Skipping check: Supabase not connected');
    return;
  }

  try {
    // 1. Get ALL active families
    const { data: families } = await supabase
      .from('families')
      .select('*')
      .eq('status', 'active');

    if (!families || families.length === 0) {
      console.log('No active families available.');
      return;
    }

    console.log(`Found ${families.length} active families. Starting rotation...`);

    // 2. Iterate through EACH family sequentially
    for (const family of families) {
      // Skip users who haven't connected Instagram yet
      if (!family.instagram_handle || !family.cookies) continue;

      console.log(`\n--- Processing family: ${family.instagram_handle} ---`);
      
      let cookies;
      try {
        let encryptedData = family.cookies;
        if (typeof encryptedData === 'string') encryptedData = JSON.parse(encryptedData);
        cookies = JSON.parse(decrypt(encryptedData));
      } catch (e) {
        console.error(`Cookie decryption failed for ${family.instagram_handle}:`, e.message);
        continue;
      }

      const bot = new InstagramAutomation(cookies);
      await bot.init();
      const agent = new YouComAgent();

      // 3. Assign random subset of targets (3 accounts) to this family
      // This ensures coverage without overloading one account
      const shuffledTargets = TARGET_ACCOUNTS.sort(() => 0.5 - Math.random());
      const assignedTargets = shuffledTargets.slice(0, 3);

      for (const target of assignedTargets) {
        const postInfo = await bot.getLatestPostInfo(target);
        
        if (postInfo) {
          const postTime = new Date(postInfo.timestamp);
          const now = new Date();
          const diffHours = (now - postTime) / (1000 * 60 * 60);

          console.log(`@${target} latest post: ${diffHours.toFixed(1)} hours ago`);

          // If post is fresh (< 2 hours), engage
          if (diffHours < 2) {
            console.log(`🔥 FRESH POST FOUND on @${target}! Engaging...`);
            
            try {
              const comment = await agent.generateComment(postInfo.caption, family);
              console.log(`   Generated comment: "${comment}"`);
              await bot.postComment(postInfo.url, comment);
            } catch (err) {
              console.error(`   Failed to post comment: ${err.message}`);
              await bot.likeRandomPosts(1); // Fallback to like
            }
          }
        }
        
        // Pause between checks
        await new Promise(r => setTimeout(r, 5000));
      }
      await bot.close();
    }

  } catch (e) {
    console.error('Scheduler Error:', e);
  }
}, 60 * 60 * 1000); // 60 minutes

// --- PORTAL API ---

// Portal Register
app.post('/api/portal/register', async (req, res) => {
  const { email, password, family_name } = req.body;
  
  if (!supabase) return res.status(500).json({ error: 'Database not connected' });

  // Check if email exists
  const { data: existing } = await supabase.from('families').select('email').eq('email', email).single();
  if (existing) return res.status(400).json({ error: 'Email already registered' });

  const { data, error } = await supabase
    .from('families')
    .insert([{ 
      email, 
      password: crypto.createHash('sha256').update(password).digest('hex'),
      name: family_name,
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
  const { email, password } = req.body;
  
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
  const allowed = ['housing_type', 'displacement_count', 'children_count', 'children_details', 'medical_conditions', 'facing_cold', 'facing_hunger', 'urgent_need', 'urgent_needs', 'urgent_need_amount'];
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

  try {
    const { data, error } = await supabase
      .storage
      .from('media')
      .upload(fileName, req.file.buffer, {
        contentType: req.file.mimetype
      });

    if (error) throw error;

    // Log upload in database (optional, or just rely on storage)
    // await supabase.from('media_uploads').insert({...})

    res.json({ status: 'SUCCESS', path: data.path });
  } catch (e) {
    console.error('Upload error:', e);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// List Media
app.get('/api/portal/media', portalAuth, async (req, res) => {
  if (!supabase) return res.status(500).json({ error: 'Supabase not configured' });

  const userFolder = req.user.instagram_handle || req.user.email.replace(/[^a-z0-9]/gi, '_');
  
  try {
    const { data, error } = await supabase
      .storage
      .from('media')
      .list(userFolder, {
        limit: 100,
        offset: 0,
        sortBy: { column: 'created_at', order: 'desc' },
      });

    if (error) throw error;

    // Generate signed URLs for display
    const filesWithUrls = await Promise.all(data.map(async (file) => {
      const { data: signed } = await supabase
        .storage
        .from('media')
        .createSignedUrl(`${userFolder}/${file.name}`, 60 * 60); // 1 hour URL
        
      return {
        ...file,
        url: signed?.signedUrl
      };
    }));

    res.json(filesWithUrls);
  } catch (e) {
    console.error('List media error:', e);
    res.status(500).json({ error: 'Failed to list media' });
  }
});

// Delete Media
app.post('/api/portal/media/delete', portalAuth, async (req, res) => {
  const { fileName } = req.body;
  if (!fileName) return res.status(400).json({ error: 'File name required' });
  if (!supabase) return res.status(500).json({ error: 'Supabase not configured' });
  
  const userFolder = req.user.instagram_handle || req.user.email.replace(/[^a-z0-9]/gi, '_');
  const filePath = `${userFolder}/${fileName}`; 

  // Basic path traversal prevention
  if (fileName.includes('..') || fileName.includes('/')) {
      return res.status(400).json({ error: 'Invalid file name' });
  }

  try {
    const { error } = await supabase
      .storage
      .from('media')
      .remove([filePath]);

    if (error) throw error;
    res.json({ status: 'SUCCESS' });
  } catch (e) {
    console.error('Delete media error:', e);
    res.status(500).json({ error: 'Failed to delete media' });
  }
});

// Forgot Password - Request Token
app.post('/api/portal/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!supabase) return res.status(500).json({ error: 'Database not connected' });

  // Check if user exists (silently fail if not to prevent enumeration)
  const { data: user } = await supabase.from('families').select('email').eq('email', email).single();
  
  if (user) {
    // Generate Token
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 3600000); // 1 hour from now

    // Save to DB
    const { error } = await supabase
      .from('families')
      .update({ reset_token: token, reset_expires: expires.toISOString() })
      .eq('email', email);

    if (!error) {
      // MOCK EMAIL SENDING: Log to console
      const resetLink = `${req.protocol}://${req.get('host')}/?token=${token}`;
      
      if (process.env.SMTP_HOST && process.env.SMTP_USER) {
        try {
          await transporter.sendMail({
            from: process.env.SMTP_FROM || '"Gaza Protocol" <noreply@example.com>',
            to: email,
            subject: 'Password Reset Request',
            html: `<p>You requested a password reset.</p><p>Click here to reset: <a href="${resetLink}">${resetLink}</a></p>`,
          });
          console.log(`📧 Email sent to ${email}`);
        } catch (emailError) {
          console.error('❌ Failed to send email:', emailError);
        }
      } else {
        console.log(`\n📧 [EMAIL MOCK] Password Reset Request for ${email}`);
        console.log(`🔗 Link: ${resetLink}\n`);
      }
    }
  }

  // Always return success for security
  res.json({ status: 'SUCCESS', message: 'If an account exists, a reset link has been sent.' });
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
  
  const bot = new InstagramAutomation();
  
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
  const rootIndexPath = path.join(__dirname, 'index.html');

  // Always update public/index.html if a new version exists in root
  if (fs.existsSync(rootIndexPath)) {
    // Check if content is different to avoid unnecessary backups
    if (!fs.existsSync(publicPath)) fs.mkdirSync(publicPath);
    
    // Always copy on startup to ensure latest version
    console.log('📦 Setup: Updating public/index.html...');
    try {
      if (fs.existsSync(indexPath)) {
        const backupPath = path.join(publicPath, `index.old.${Date.now()}.html`);
        fs.renameSync(indexPath, backupPath);
        console.log(`   Old version backed up to ${path.basename(backupPath)}`);
      }
      fs.copyFileSync(rootIndexPath, indexPath);
      console.log('✅ Setup complete: index.html updated successfully.');
    } catch (e) {
      console.error('❌ Error updating index.html:', e.message);
    }

    // Watch for changes in index.html and update public version immediately
    fs.watchFile(rootIndexPath, { interval: 1000 }, (curr, prev) => {
      if (curr.mtime > prev.mtime) {
        console.log('🔄 Detected change in index.html. Updating public/index.html...');
        fs.copyFileSync(rootIndexPath, indexPath);
      }
    });
  } else if (!fs.existsSync(indexPath)) {
    console.log('⚠️  WARNING: public/index.html not found! Please ensure index.html is in the "public" folder.');
  }
});