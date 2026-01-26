# Decodo Mobile Proxy Setup Guide

## Critical Security Update

This update implements **Decodo Mobile SOCKS5H proxy** with **fail-closed behavior** to prevent Instagram from detecting your automation as datacenter traffic.

### Why This Matters

**The Problem:**
- Railway runs on AWS/Google Cloud datacenter IPs
- Instagram automatically flags datacenter traffic as "bot behavior"
- Mobile proxies (Videotron/Rogers network) appear as legitimate mobile users
- **Device mismatch** (desktop User-Agent + mobile IP) triggers detection

**The Solution:**
- Decodo Mobile proxy (Montreal, Videotron network)
- iPhone 16 Pro User-Agent (matches mobile connection)
- Fail-closed proxy (if proxy fails, script stops - no Railway IP exposure)
- Sticky sessions (60 min) per family account

---

## Decodo Proxy Configuration

### 1. Get Your Credentials

Sign up at: https://decodo.com/dashboard

**Credentials Format:**
```
Protocol: socks5h://
Username: user-spmto59f4g-country-ca-city-montreal-session-{sessionId}-sessionduration-60
Password: Polpi7u_Fnpp5I1c4K
Server: gate.decodo.com
Port: 7000
```

**Session ID Format:**
- Each family gets unique session: `family-{instagram_handle}`
- Login sessions: `login-{username}`
- Test sessions: `test-session`

### 2. Update Railway Environment Variables

Go to Railway → Your Project → Variables

**Required Variables:**
```bash
# Decodo Mobile Proxy (REQUIRED)
PROXY_USERNAME=user-spmto59f4g
PROXY_PASSWORD=Polpi7u_Fnpp5I1c4K
PROXY_SERVER=gate.decodo.com
PROXY_PORT=7000
PROXY_COUNTRY=ca
PROXY_CITY=montreal
PROXY_SESSION_DURATION=60

# Timezone (MUST match proxy location - Montreal)
TIMEZONE=America/Montreal

# Geolocation (Montreal coordinates)
GEO_LATITUDE=45.5017
GEO_LONGITUDE=-73.5673

# Browser mode
HEADLESS=true
```

### 3. Local Development Setup

Create/update `.env` file:

```bash
# Copy from .env.example
cp .env.example .env

# Edit .env with your Decodo credentials
nano .env
```

**Critical Variables:**
```bash
PROXY_USERNAME=user-spmto59f4g
PROXY_PASSWORD=your_password_here
PROXY_SERVER=gate.decodo.com
PROXY_PORT=7000
PROXY_COUNTRY=ca
PROXY_CITY=montreal
PROXY_SESSION_DURATION=60
TIMEZONE=America/Montreal
GEO_LATITUDE=45.5017
GEO_LONGITUDE=-73.5673
HEADLESS=false  # For local testing, set to false to see browser
```

---

## Testing the Proxy

### Test 1: Verify Proxy Connectivity (cURL)

```bash
# Test with city targeting (Montreal)
curl -x "socks5h://user-spmto59f4g-country-ca-city-montreal-session-test1-sessionduration-60:Polpi7u_Fnpp5I1c4K@gate.decodo.com:7000" "https://ip.decodo.com"
```

**Expected Output:**
```json
{
  "ip": "142.xxx.xxx.xxx",
  "city": "Montreal",
  "country": "CA",
  "isp": "Videotron Ltee"
}
```

### Test 2: Verify Different Session IDs Get Different IPs

```bash
# Session 1
curl -x "socks5h://user-spmto59f4g-country-ca-city-montreal-session-family1-sessionduration-60:Polpi7u_Fnpp5I1c4K@gate.decodo.com:7000" "https://ip.decodo.com"

# Session 2 (should get different IP)
curl -x "socks5h://user-spmto59f4g-country-ca-city-montreal-session-family2-sessionduration-60:Polpi7u_Fnpp5I1c4K@gate.decodo.com:7000" "https://ip.decodo.com"
```

**Why This Matters:**
Each family account uses a unique session ID, giving them separate IPs. This prevents Instagram from linking accounts.

### Test 3: Verify Sticky Sessions (Same IP for 60 min)

```bash
# Run twice - should get SAME IP within 60 minutes
curl -x "socks5h://user-spmto59f4g-country-ca-city-montreal-session-test-sticky-sessionduration-60:Polpi7u_Fnpp5I1c4K@gate.decodo.com:7000" "https://ip.decodo.com"

# Wait 5 seconds
sleep 5

# Run again - should be SAME IP
curl -x "socks5h://user-spmto59f4g-country-ca-city-montreal-session-test-sticky-sessionduration-60:Polpi7u_Fnpp5I1c4K@gate.decodo.com:7000" "https://ip.decodo.com"
```

### Test 4: Run Local Instagram Test

```bash
# Install dependencies
npm install

# Run test script
npm run test-automation
```

**Expected Console Output:**
```
Initializing browser...
Using Decodo Mobile Proxy:
   Server: gate.decodo.com:7000
   Location: montreal, CA
   Session ID: test-session
   Duration: 60 minutes (sticky)
   Testing proxy connectivity...
   ✓ Proxy test successful. IP: 142.xxx.xxx.xxx, Location: Montreal, CA
   Browser launched. Creating context...
   Context created. Opening page...
Browser initialized
```

**If you see this error:**
```
❌ CRITICAL: Proxy connection failed. Refusing to continue without proxy.
   This prevents accidental Railway datacenter IP exposure to Instagram.
```

**Troubleshooting:**
1. Verify credentials in `.env` are correct
2. Check Decodo dashboard for account status
3. Ensure you have bandwidth remaining
4. Try different session ID

---

## Security Features Implemented

### 1. Fail-Closed Proxy Behavior

**What it does:**
If the proxy connection fails for ANY reason, the script immediately stops and throws an error.

**Why it matters:**
Without this, if the proxy drops, Playwright would use Railway's datacenter IP. Instagram would see:
- IP suddenly changes from Montreal mobile → AWS datacenter
- Instant ban

**Code Location:**
`instagram-automation.js:155-165`

```javascript
try {
  console.log('   Testing proxy connectivity...');
  const testResult = await this.testProxyConnection(proxyUrl);
  if (!testResult.success) {
    throw new Error(`Proxy test failed: ${testResult.error}. STOPPING to prevent Railway IP exposure.`);
  }
} catch (error) {
  console.error('❌ CRITICAL: Proxy connection failed.');
  throw error; // Script stops here
}
```

### 2. Device-Type Matching

**User-Agent:**
```
Mozilla/5.0 (iPhone; CPU iPhone OS 17_2_1 like Mac OS X)
AppleWebKit/605.1.15 (KHTML, like Gecko)
Version/17.2 Mobile/15E148 Safari/604.1
```

**Viewport:** `390 x 844` (iPhone 16 Pro)

**Device Properties:**
- `isMobile: true`
- `hasTouch: true`
- `maxTouchPoints: 10`
- `platform: 'iPhone'`
- `connection.effectiveType: '4g'`

**Why it matters:**
Instagram sees:
- ✅ Mobile IP (Videotron cellular network)
- ✅ Mobile User-Agent (iPhone 16 Pro)
- ✅ Mobile viewport (390x844)
- ✅ Touch support (10 points)
- ✅ 4G connection type

**Without matching:**
- ❌ Mobile IP + Desktop User-Agent = Red flag
- ❌ "Why is a MacBook connecting via cell tower?"

### 3. Per-Family Session Isolation

**How it works:**
Each family account gets a unique session ID:
```javascript
// Family 1
sessionId = 'family-sarah_gaza_voice'
// Gets IP: 142.123.45.67 (Montreal, Videotron)

// Family 2
sessionId = 'family-ahmed_gaza_stories'
// Gets IP: 142.123.45.200 (Montreal, Videotron)
```

**Why it matters:**
- Each family appears as separate mobile user
- Instagram can't link accounts by IP
- If one account gets flagged, others are safe

### 4. Sticky Sessions (60 Minutes)

**What it does:**
The same session ID gets the same IP for 60 minutes.

**Why it matters:**
Instagram expects:
- Login from IP: 142.123.45.67
- Scroll feed from SAME IP
- Like posts from SAME IP
- Post content from SAME IP

**Without sticky sessions:**
- Login from IP: 142.123.45.67
- Scroll from IP: 142.123.45.200 (different!)
- Instagram: "Account hacked? Session hijacking?"

---

## Monitoring & Troubleshooting

### Check Railway Logs

Railway Dashboard → Deployments → Logs

**Successful Proxy Connection:**
```
Using Decodo Mobile Proxy:
   Server: gate.decodo.com:7000
   Location: montreal, CA
   Session ID: family-sarah_gaza
   Duration: 60 minutes (sticky)
   Testing proxy connectivity...
   ✓ Proxy test successful. IP: 142.xxx.xxx.xxx, Location: Montreal, CA
```

**Failed Proxy Connection:**
```
Using Decodo Mobile Proxy:
   ...
   Testing proxy connectivity...
❌ CRITICAL: Proxy connection failed. Refusing to continue without proxy.
Error: Proxy test failed: Connection timeout
```

### Common Issues

#### Issue 1: "Proxy connection timeout"

**Causes:**
- Decodo service down (rare)
- No bandwidth remaining
- Incorrect credentials

**Solution:**
1. Check Decodo dashboard: https://decodo.com/dashboard
2. Verify bandwidth usage
3. Check credentials in Railway env vars

#### Issue 2: "Wrong location returned"

**Expected:** `Montreal, CA`
**Got:** `Toronto, CA` or different city

**Cause:**
City targeting might not be working (Decodo routing issue)

**Impact:**
Low - both are Canadian mobile IPs. Instagram won't flag this.

**Optional Fix:**
Update geolocation env vars to match actual city:
```bash
# If proxy returns Toronto
GEO_LATITUDE=43.6532
GEO_LONGITUDE=-79.3832
TIMEZONE=America/Toronto
```

#### Issue 3: "Device mismatch detected"

**Symptoms:**
- Account flagged immediately after login
- "Suspicious activity" warning

**Cause:**
User-Agent doesn't match proxy type

**Verify:**
Check Railway logs for User-Agent:
```
User-Agent: Mozilla/5.0 (iPhone; CPU iPhone OS 17_2_1...
```

Should say `iPhone`, NOT `Macintosh` or `Windows`.

#### Issue 4: "Session expired mid-automation"

**Symptoms:**
- Login successful
- Scroll works
- Suddenly "Connection lost"

**Cause:**
Session duration (60 min) expired during long automation run

**Solution:**
Keep automation runs under 60 minutes, or increase session duration:
```bash
PROXY_SESSION_DURATION=120  # 2 hours
```

---

## Bandwidth Usage & Cost

### Per-Family Session Bandwidth

**With Optimization (Data Saver mode):**
- Login: ~2MB
- Cookie consent: ~1MB
- 15s feed scroll: ~4MB
- Like 3 posts: ~0.5MB
- **Total: ~7.5MB per session**

### Monthly Bandwidth Calculation

**Formula:** `Number of families × Sessions per month × 7.5MB`

**Examples:**

**10 families, 3 logins/month:**
- 10 × 3 × 7.5MB = **225MB/month**
- Decodo plan needed: **2GB** ($10-15/month)

**10 families, daily automation:**
- 10 × 30 × 7.5MB = **2.25GB/month**
- Decodo plan needed: **3GB** ($15-20/month)

### Cost Comparison

| Provider | Type | Bandwidth | Cost | Location |
|----------|------|-----------|------|----------|
| **Decodo** | Mobile | 2GB | $10/mo | Montreal (Videotron) |
| IPRoyal | Residential | 2GB | $10/mo | Canada (mixed) |
| Bright Data | Residential | 1GB | $8.50 | Canada (mixed) |

**Winner:** Decodo - Mobile IPs have highest trust with Instagram.

---

## Deployment Checklist

### Pre-Deployment

- [ ] Sign up for Decodo Mobile proxy
- [ ] Test proxy with cURL commands (3 tests)
- [ ] Update `.env.example` with Decodo settings
- [ ] Test locally with `npm run test-automation`
- [ ] Verify User-Agent in logs shows iPhone
- [ ] Verify geolocation shows Montreal

### Railway Deployment

- [ ] Update Railway environment variables:
  - [ ] `PROXY_USERNAME`
  - [ ] `PROXY_PASSWORD`
  - [ ] `PROXY_SERVER`
  - [ ] `PROXY_PORT`
  - [ ] `PROXY_COUNTRY`
  - [ ] `PROXY_CITY`
  - [ ] `PROXY_SESSION_DURATION`
  - [ ] `TIMEZONE=America/Montreal`
  - [ ] `GEO_LATITUDE=45.5017`
  - [ ] `GEO_LONGITUDE=-73.5673`
  - [ ] `HEADLESS=true`

- [ ] Push updated code to branch
- [ ] Trigger Railway deployment
- [ ] Monitor logs for proxy connection success
- [ ] Test Instagram login via portal
- [ ] Verify no account flags/warnings

### Post-Deployment Monitoring

- [ ] Check Decodo dashboard daily for bandwidth usage
- [ ] Monitor Railway logs for proxy errors
- [ ] Test login for each family weekly
- [ ] Watch for Instagram account warnings
- [ ] Track bandwidth usage vs. plan limit

---

## Advanced Configuration

### Multiple Cities (For Multiple Families)

If you want different families to appear from different cities:

**Family 1 (Montreal):**
```javascript
sessionId = 'family-sarah-mtl'
username = 'user-spmto59f4g-country-ca-city-montreal-session-family-sarah-mtl-sessionduration-60'
```

**Family 2 (Toronto):**
```javascript
sessionId = 'family-ahmed-tor'
username = 'user-spmto59f4g-country-ca-city-toronto-session-family-ahmed-tor-sessionduration-60'
```

Update environment variables per session in code (requires server.js modifications).

### Session Duration Optimization

**Short automation (<30 min):**
```bash
PROXY_SESSION_DURATION=30
```
✅ Saves bandwidth (IP rotates faster)
❌ Higher detection risk if login + post happens across sessions

**Long automation (>60 min):**
```bash
PROXY_SESSION_DURATION=120
```
✅ More stable (same IP throughout)
❌ Uses more bandwidth (IP held longer)

**Recommended:** `60` minutes (default)

---

## Security Best Practices

### 1. Never Bypass Proxy

**Bad:**
```javascript
const bot = new InstagramAutomation(cookies);
// This would expose Railway IP if proxy fails
```

**Good:**
```javascript
const bot = new InstagramAutomation(cookies, null, { server: 'proxy' }, sessionId);
// Fail-closed behavior - stops if proxy fails
```

### 2. Always Use Unique Session IDs

**Bad:**
```javascript
// All families use same session = same IP
sessionId = 'default-session'
```

**Good:**
```javascript
// Each family gets unique IP
sessionId = `family-${family.instagram_handle}`
```

### 3. Match Timezone to Proxy Location

**Bad:**
```bash
TIMEZONE=Asia/Gaza  # Mismatch with Montreal IP!
```

**Good:**
```bash
TIMEZONE=America/Montreal  # Matches Decodo city
```

### 4. Test Before Deploying

Always test proxy locally before Railway deployment:
```bash
npm install
npm run test-automation
```

If local test fails, Railway will fail too (but with less visibility).

---

## Frequently Asked Questions

### Q: Can I use the same proxy for all families?

**A:** Yes, but with **unique session IDs**. Each family gets a different IP within the same proxy pool.

### Q: What if Decodo goes down?

**A:** Script will fail-closed and stop. No Instagram requests will be made. This protects your accounts from Railway IP exposure.

### Q: Can I switch proxy providers later?

**A:** Yes. Update env vars with new provider's SOCKS5 credentials. Code is provider-agnostic.

### Q: Why mobile proxy instead of residential?

**A:** Mobile IPs (Videotron/Rogers) have higher trust scores with Instagram. They're real cellular network IPs, not pooled residential DSL.

### Q: Does this work with n8n workflows?

**A:** Yes, if n8n is running on Railway with same env vars. Pass `sessionId` to InstagramAutomation constructor in n8n nodes.

### Q: What if I see "Device mismatch" warnings?

**A:** Verify User-Agent in logs shows `iPhone`, not `Macintosh`. Check viewport is `390 x 844`.

### Q: Can I use this for automated posting (not just comments)?

**A:** Yes, but warm up accounts first:
- Week 1-2: Manual activity only (scrolling, liking)
- Week 3+: Enable automated posting

---

## Support & Documentation

**Decodo Dashboard:** https://decodo.com/dashboard
**Decodo Docs:** https://decodo.com/docs
**Railway Dashboard:** https://railway.app/dashboard

**Internal Documentation:**
- [Gaza Account Strategy](GAZA_ACCOUNT_STRATEGY.md)
- [Bandwidth Optimization](BANDWIDTH_OPTIMIZATION.md)
- [Proxy Error Handling](PROXY_ERROR_HANDLING.md)

---

**Every connection secured is another voice protected.**

🇵🇸
