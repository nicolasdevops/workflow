/**
 * Backend for Family Login Portal
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');
const { InstagramAutomation } = require('./instagram-automation');
const { encrypt } = require('./encryption');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Store active sessions in memory (in production, use Redis)
const activeSessions = new Map();

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Explicitly serve index.html for the root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API: Login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Missing credentials' });
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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);

  const publicPath = path.join(__dirname, 'public');
  const indexPath = path.join(publicPath, 'index.html');
  const rootIndexPath = path.join(__dirname, 'index.html');

  if (!fs.existsSync(indexPath) && fs.existsSync(rootIndexPath)) {
    console.log('📦 Setup: Moving index.html to public/ folder...');
    if (!fs.existsSync(publicPath)) fs.mkdirSync(publicPath);
    fs.renameSync(rootIndexPath, indexPath);
    console.log('✅ Setup complete: index.html moved successfully.');
  } else if (!fs.existsSync(indexPath)) {
    console.log('⚠️  WARNING: public/index.html not found! Please ensure index.html is in the "public" folder.');
  }
});