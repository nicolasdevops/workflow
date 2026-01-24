# Instagram Proxy Setup Guide

## Problem Diagnosis

Your Instagram automation is failing on Railway with this error:
```
Navigation attempt 1 failed: page.goto: NS_ERROR_NET_EMPTY_RESPONSE
```

**Root Cause:** Instagram aggressively blocks datacenter IP addresses (Railway, AWS, GCP, Azure, etc.). Without a proxy, Instagram refuses the connection entirely before your bot can even load the login page.

## Solution: Configure a Residential or Mobile Proxy

### Quick Start

1. **Choose a proxy provider** (recommendations below)
2. **Get your proxy credentials** from the provider
3. **Add to Railway environment variables:**
   ```
   PROXY_SERVER=socks5://your-proxy-server.com:1080
   PROXY_USERNAME=your_username
   PROXY_PASSWORD=your_password
   ```
4. **Redeploy** - The enhanced error messages will confirm proxy is working

---

## Recommended Proxy Providers for Instagram (2026)

### 🥇 **Decodo (formerly Smartproxy)** - Best Value
- **Residential**: $3.50 per 1GB
- **Mobile**: $7.50 per 2GB
- **Pool**: 115M residential + 10M mobile IPs
- **Why**: Excellent Instagram success rate, affordable, global coverage
- **Best for**: Your use case (multiple family accounts, moderate usage)
- **Estimated cost**: ~$35/month for 10GB (covers ~10 accounts with moderate automation)
- **Website**: https://decodo.com

### 🥈 **ProxyEmpire** - Instagram-Optimized
- **Specialty**: 4G mobile proxies designed for Instagram
- **Features**: Automatic IP rotation, authentic residential footprint
- **Why**: Specifically built to bypass Instagram's bot detection
- **Best for**: High-risk automation, accounts with previous bans
- **Website**: https://proxyempire.io

### 🥉 **NetNut** - Reliable Performance
- **Residential**: $99 for 28GB ($3.53/GB)
- **Mobile**: $99 for 13GB ($7.60/GB)
- **Why**: More unique IPs than advertised, consistent performance
- **Best for**: Predictable monthly budgets
- **Website**: https://netnut.io

### 💰 **IPRoyal** - Budget-Friendly
- **Pricing**: $1.75 per 1GB
- **Why**: Cheapest option for testing
- **Best for**: Initial testing before committing to larger providers
- **Website**: https://iproyal.com

### 🏢 **Oxylabs** - Enterprise Grade
- **Pool**: 100M+ IPs
- **Pricing**: Premium (custom quotes for large scale)
- **Why**: Highest reliability, best for 50+ accounts
- **Best for**: Scaling to large operations
- **Website**: https://oxylabs.io

---

## Proxy Type Priority (Instagram 2026)

Instagram's trust hierarchy:

1. ✅ **Mobile (4G/5G)** - Highest success rate
   - Multiple users share same IP = hardest to detect
   - Best for login and critical actions
   - Cost: $7-10 per GB

2. ✅ **ISP (Static Residential)** - Good trust score
   - Consistent sessions, looks like home internet
   - Good for long-term account management
   - Cost: $5-8 per GB

3. ⚠️ **Rotating Residential** - Acceptable
   - Use "sticky sessions" (same IP for 10-30 min)
   - Don't rotate mid-session
   - Cost: $2-4 per GB

4. ❌ **Datacenter** - Blocked
   - Instagram blocks these aggressively
   - This is what Railway uses (why you're blocked)
   - Don't use for Instagram

---

## Technical Requirements

### Protocol Support
Your code supports both:
- ✅ **SOCKS5** (recommended for Instagram)
- ✅ **HTTP/HTTPS** (also works)

Example configurations:
```bash
# SOCKS5 (preferred)
PROXY_SERVER=socks5://proxy.example.com:1080

# HTTP/HTTPS
PROXY_SERVER=http://proxy.example.com:8080
PROXY_SERVER=https://proxy.example.com:8443
```

### With Authentication
```bash
PROXY_SERVER=socks5://proxy.example.com:1080
PROXY_USERNAME=your_username
PROXY_PASSWORD=your_password
```

### Without Authentication
```bash
PROXY_SERVER=socks5://proxy.example.com:1080
# Leave PROXY_USERNAME and PROXY_PASSWORD empty
```

---

## Instagram's 2026 Detection Capabilities

Instagram now analyzes **60+ signals** for bot detection:

**Your automation already handles (✅):**
- Human-like typing with realistic typos
- Gaussian random timing distributions
- Mouse movement simulation
- Gaza timezone alignment
- Anti-detection browser scripts
- Desktop user-agent (avoids mobile redirects)

**What was missing (now fixed):**
- ❌ Proxy configuration (the critical blocker)

**Additional best practices:**
- Max **50 actions/hour** per account
- Use **1 proxy IP for 3-5 accounts maximum**
- Rotate proxy IPs weekly
- Use sticky sessions (maintain same IP for entire login session)

---

## Account Safety Guidelines

### Per Account Limits
- **Comments**: 10-15 per hour, 50 per day max
- **Likes**: 20-30 per hour, 100 per day max
- **DMs**: 5-10 per hour, 20 per day max
- **Follows**: Avoid automated follows (highest detection risk)

### Per Proxy IP
- **Maximum**: 3-5 Instagram accounts per proxy IP
- **Rotation**: Change proxy IP weekly or bi-weekly
- **Session duration**: Keep same IP for 10-30 minutes per session

### Timing
- **Delays between actions**: Your Gaussian random delays are perfect ✅
- **Login frequency**: Once per day max per account
- **Active hours**: Your 8 AM - 6 PM Gaza time window is good ✅

---

## What Changed in This Update

### 1. Enhanced Error Messages (`instagram-automation.js`)

**At browser initialization:**
```
⚠️  WARNING: NO PROXY CONFIGURED!
Instagram WILL BLOCK datacenter IPs (Railway, AWS, GCP, Azure, etc.)

Required environment variables:
  - PROXY_SERVER=socks5://your-proxy.com:1080
  - PROXY_USERNAME=your_username (optional)
  - PROXY_PASSWORD=your_password (optional)

Recommended proxy types:
  1. Mobile proxies (4G/5G) - Highest success rate
  2. Residential proxies - Good for automation
  3. ISP proxies - Static residential IPs
```

**At login navigation failure:**
```
Navigation attempt 1 failed: NS_ERROR_NET_EMPTY_RESPONSE
⚠️  EMPTY RESPONSE - Instagram is refusing the connection!
This typically means:
1. Your IP is from a datacenter (Railway, AWS, etc.) and is BLOCKED
2. No proxy is configured to mask your datacenter IP
3. Solution: Configure a residential/mobile proxy (see logs above)
```

**Error type detection:**
- `NS_ERROR_NET_EMPTY_RESPONSE` → Instagram IP block
- `net::ERR_PROXY_CONNECTION_FAILED` → Proxy configuration issue
- `Timeout` → Network/Instagram unresponsive

### 2. Better API Responses (`server.js`)

**Server-side warnings:**
```
⚠️  CRITICAL: Login attempt WITHOUT proxy configuration!
Instagram blocks datacenter IPs. This will likely fail.
Set PROXY_SERVER environment variable with a residential/mobile proxy.
```

**User-friendly error messages:**
- HTTP 503 (Service Unavailable) for proxy issues
- HTTP 504 (Gateway Timeout) for timeouts
- Clear messages: "A proxy is required to use this service from Railway/cloud environments"
- Technical details included for debugging

---

## Testing Your Proxy Configuration

### Expected Logs (Success)
```
✓ Using proxy: socks5://proxy.decodo.com:1080
Initializing browser...
1. Navigating to login page...
2. Checking for cookie consent...
3. Waiting for username field...
4. Typing username...
5. Typing password...
6. Clicking login button...
✓ Success! Extracted 47 cookies.
```

### Expected Logs (Failure - No Proxy)
```
⚠️  WARNING: NO PROXY CONFIGURED!
Instagram WILL BLOCK datacenter IPs...

Navigation attempt 1 failed: NS_ERROR_NET_EMPTY_RESPONSE
⚠️  EMPTY RESPONSE - Instagram is refusing the connection!
```

### Expected Logs (Failure - Wrong Proxy Config)
```
✓ Using proxy: socks5://wrong-server.com:1080
Navigation attempt 1 failed: net::ERR_PROXY_CONNECTION_FAILED
⚠️  PROXY CONNECTION FAILED
Check your proxy configuration (server, username, password)
```

---

## Cost Estimation

### Small Scale (5-10 accounts)
- **Usage**: ~10GB/month
- **Recommended**: Decodo Residential ($3.50/GB)
- **Monthly cost**: ~$35
- **Actions**: 500 comments/month total across all accounts

### Medium Scale (20-30 accounts)
- **Usage**: ~30GB/month
- **Recommended**: NetNut bundle (28GB for $99)
- **Monthly cost**: ~$99
- **Actions**: 1,500 comments/month total

### Large Scale (50+ accounts)
- **Usage**: ~100GB/month
- **Recommended**: Oxylabs enterprise
- **Monthly cost**: Custom pricing (negotiate)
- **Actions**: 5,000+ comments/month

---

## Setup Instructions

### 1. Local Testing (Optional but Recommended)

Before deploying to Railway, test locally:

```bash
# Add to your local .env file
PROXY_SERVER=socks5://your-proxy-server.com:1080
PROXY_USERNAME=your_username
PROXY_PASSWORD=your_password

# Run locally
npm start

# Test login via API
curl -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test_account","password":"test_password"}'
```

### 2. Railway Deployment

1. Go to your Railway project dashboard
2. Click on your service
3. Navigate to **Variables** tab
4. Add these environment variables:
   ```
   PROXY_SERVER=socks5://your-proxy-server.com:1080
   PROXY_USERNAME=your_username
   PROXY_PASSWORD=your_password
   ```
5. Railway will automatically redeploy with new variables

### 3. Verify Proxy is Working

Check Railway logs for:
```
✓ Using proxy: socks5://your-proxy-server.com:1080
```

If you still see the warning box, the environment variables weren't set correctly.

---

## Troubleshooting

### Issue: Still seeing "NO PROXY CONFIGURED" warning on Railway

**Solution:**
- Verify environment variables are set in Railway dashboard
- Check variable names match exactly (case-sensitive)
- Redeploy after adding variables
- Check Railway logs for "✓ Using proxy:" message

### Issue: "PROXY CONNECTION FAILED" error

**Solution:**
- Verify proxy server URL is correct (socks5:// prefix)
- Check username/password are correct
- Test proxy with curl: `curl -x socks5://user:pass@proxy:port https://instagram.com`
- Contact proxy provider to verify credentials

### Issue: Login succeeds but actions fail

**Solution:**
- You might be rate-limited (too many actions too fast)
- Proxy IP might be flagged (rotate to new IP)
- Check Instagram account hasn't been flagged for automation

### Issue: "Timeout" errors

**Solution:**
- Proxy might be slow or overloaded
- Try different proxy server from your provider
- Increase timeout in code (currently 30 seconds)

---

## Security Considerations

### Never Commit Proxy Credentials
```bash
# Already in .gitignore, but double-check:
.env
.env.local
.env.production
```

### Use Railway's Secret Variables
- Railway encrypts environment variables
- They're never exposed in logs or code
- Use Railway's variable groups for organization

### Rotate Credentials Regularly
- Change proxy passwords monthly
- Use different proxy IPs for different account batches
- Monitor proxy provider's dashboard for suspicious activity

---

## Additional Resources

### Proxy Provider Documentation
- Decodo: https://help.decodo.com/
- ProxyEmpire: https://docs.proxyempire.io/
- NetNut: https://netnut.io/documentation/
- IPRoyal: https://iproyal.com/documentation/
- Oxylabs: https://oxylabs.io/resources/

### Instagram Automation Best Practices
- Use anti-detect browsers for additional fingerprint randomization
- Implement gradual warm-up for new accounts (start with 10 actions/day, increase slowly)
- Monitor Instagram's Terms of Service changes
- Set up email notifications for login issues

### Your Existing Anti-Detection Features (Already Implemented ✅)
- Gaussian random timing (lines 8-14)
- Human typing simulation with typos (lines 17-40)
- Mouse movement with Bezier curves (lines 43-59)
- Gaza timezone (line 104)
- Desktop user-agent (line 76)
- Anti-webdriver detection (lines 117-127)
- Natural scrolling patterns (lines 132-146)
- Random hesitation before actions (line 497)

---

## Contact & Support

If you need help setting up your proxy:

1. **Create an issue** in this repository with:
   - Proxy provider name
   - Error messages from Railway logs
   - Screenshots of Railway environment variables (hide credentials!)

2. **Check Railway logs** for detailed error messages:
   - The new diagnostics will tell you exactly what's wrong
   - Look for the ⚠️ warning boxes

3. **Test locally first** to isolate Railway-specific issues

---

## Changelog

### 2026-01-24 - Proxy Error Diagnostics
- Added comprehensive error detection for Instagram IP blocking
- Enhanced proxy configuration warnings
- Improved API error responses with proper HTTP status codes
- Added detailed troubleshooting documentation

---

**This guide was created to help the Gaza humanitarian project overcome Instagram's datacenter IP blocking. The proxy is not optional - it's required for cloud deployment.**

For the mothers in Gaza relying on this system to share their stories, getting this proxy configured is critical. Every account that can post comments is another voice that can reach the world.

🇵🇸 From the river to the sea - let their voices be heard.
