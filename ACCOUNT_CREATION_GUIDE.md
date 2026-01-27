# Instagram Account Creation Guide (On Behalf of Families)

## Context

Creating Instagram accounts on behalf of Gaza families is more practical and secure because:
1. Privacy/security setup is too complex to explain remotely
2. Families face internet connectivity issues
3. Risk of account suspension if setup done incorrectly
4. We can guarantee proper proxy/location configuration

**This guide covers:** Email creation → Phone verification → Instagram account creation → Credential storage

---

## Overview

### Account Creation Flow

```
1. Email Creation (ProtonMail/Tutanota)
   ↓
2. Phone Verification (SMS-Activate)
   ↓
3. Instagram Account Creation (via Proxy)
   ↓
4. Account Warm-up (2 weeks)
   ↓
5. Hand off to Family (credentials via secure channel)
```

### Database Columns

**Migration 3** adds these columns to `families` table:
- `ig_email` - Email address (e.g., sarah_gaza_2026@protonmail.com)
- `ig_email_password` - Email password (encrypted)
- `ig_username` - Instagram username (e.g., sarah_gaza_voice)
- `ig_password` - Instagram password (encrypted)
- `ig_phone_number` - Verification number (from SMS service)
- `ig_account_created_at` - Creation timestamp
- `ig_account_status` - Status: pending, created, verified, active, suspended

---

## Step 1: Email Creation

### Recommended Providers

**Option A: ProtonMail (Recommended)**
- **URL:** https://proton.me/mail
- **Phone Verification:** Sometimes required, sometimes skippable
- **Privacy:** End-to-end encrypted, based in Switzerland
- **Cost:** Free tier available
- **Why:** Best privacy, Instagram trusts it

**Option B: Tutanota**
- **URL:** https://tutanota.com
- **Phone Verification:** Rarely required
- **Privacy:** End-to-end encrypted, based in Germany
- **Cost:** Free tier available
- **Why:** Good privacy, rarely asks for phone

**Option C: Mailfence (Backup)**
- **URL:** https://mailfence.com
- **Phone Verification:** Sometimes required
- **Privacy:** Belgian provider, good privacy
- **Cost:** Free tier available

**NOT Recommended:**
- ❌ Gmail (always requires phone now)
- ❌ Mail.com (requires phone)
- ❌ Outlook/Hotmail (requires phone)

### ProtonMail Creation Process

**Using Decodo Proxy (Important):**
```bash
# Connect through same proxy location as family's Instagram account
# Example: If family assigned to Beirut, use Beirut proxy for email creation

# Use Decodo proxy in browser:
# 1. Configure Firefox proxy settings manually
# 2. SOCKS5 Host: gate.decodo.com
# 3. Port: 7000
# 4. Username: user-spmto59f4g-country-lb-city-beirut-session-email-creation
# 5. Password: [your Decodo password]
```

**Step-by-Step:**
1. Connect to Decodo proxy (match family's assigned city)
2. Go to https://proton.me/mail/signup
3. Choose "Free" plan
4. Enter email username: `[family_name]_gaza_2026` (e.g., sarah_gaza_2026)
5. If phone verification required → Use SMS-Activate (see below)
6. If phone skippable → Click "Skip" or "Use email instead"
7. Create strong password (save to password manager)
8. Complete CAPTCHA
9. Save recovery email (use a secure email you control)

**Store in Database:**
```sql
UPDATE families
SET ig_email = 'sarah_gaza_2026@protonmail.com',
    ig_email_password = '[encrypted_password]'
WHERE id = 1;
```

---

## Step 2: Phone Verification

### When You Need It

- Email creation (ProtonMail sometimes, Gmail always)
- Instagram account creation (always)

### SMS Verification Service: SMS-Activate

**URL:** https://sms-activate.org

**Cost:**
- Instagram verification: $0.30 - $0.50 per number
- Email verification: $0.20 - $0.40 per number

**Supported Countries:**
- Canada: ~$0.35/number
- USA: ~$0.30/number
- France: ~$0.40/number
- Bosnia: ~$0.50/number (limited availability)
- Lebanon: ~$0.45/number (limited availability)

**Alternative Services:**
- 5sim.net (~$0.50/number)
- GetSMSCode.com (~$0.40/number)
- OnlineSIM.io (~$0.35/number)

### SMS-Activate Process

**Setup:**
1. Go to https://sms-activate.org
2. Register account
3. Add $10 credit (PayPal, crypto, or credit card)
4. Select your country (match proxy location if possible)

**For Email Verification:**
1. Search for "ProtonMail" or "Other" in services list
2. Select country (Canada/USA recommended)
3. Click "Buy number"
4. Number appears in dashboard
5. Copy number to email signup form
6. Wait for SMS (usually 30-90 seconds)
7. Enter verification code
8. Number auto-expires after use

**For Instagram Verification:**
1. Search for "Instagram" in services list
2. Select country (match proxy city country)
3. Click "Buy number"
4. Number appears in dashboard
5. Copy number to Instagram signup
6. Wait for SMS code
7. Enter code in Instagram
8. Number expires

**Cost Tracking:**
- Email verification: $0.30 per family
- Instagram verification: $0.40 per family
- **Total per family: ~$0.70**

---

## Step 3: Instagram Account Creation

### Prerequisites

✅ Email created and verified
✅ ProtonMail/Tutanota account accessible
✅ Decodo proxy configured (match family's city)
✅ SMS-Activate account funded

### Creation Process (Via Automation)

**Manual Method (Browser):**

1. **Connect to Decodo Proxy:**
   - Configure browser SOCKS5 proxy
   - Server: `gate.decodo.com:7000`
   - Username: `user-spmto59f4g-country-[code]-city-[city]-session-family-[name]`
   - Password: `[Decodo password]`

2. **Navigate to Instagram:**
   - Go to https://www.instagram.com/accounts/emailsignup/
   - Use browser in private/incognito mode

3. **Fill Signup Form:**
   - **Email:** Use the ProtonMail email created in Step 1
   - **Full Name:** Family's chosen name (e.g., "Sarah from Gaza")
   - **Username:** Generate from family name (e.g., sarah_gaza_voice)
   - **Password:** Strong password (save to password manager)

4. **Phone Verification:**
   - When Instagram asks for phone
   - Go to SMS-Activate dashboard
   - Purchase Instagram number (match country)
   - Enter number in Instagram form
   - Wait for SMS code (usually 30-90 seconds)
   - Enter code in Instagram
   - Number expires automatically

5. **Complete Profile:**
   - **Profile Picture:** Placeholder (family can update later)
   - **Bio:** Leave empty initially (family fills later)
   - **Website:** Leave empty
   - **Gender:** As appropriate
   - **Birthday:** Realistic age (25-45 years old)

6. **Initial Activity (Critical):**
   - Follow 10-15 Western news accounts (CNN, BBC, Al Jazeera)
   - Follow 5-10 human rights organizations
   - Like 10-15 posts (non-Gaza content initially)
   - Browse for 10-15 minutes
   - **DO NOT post anything yet**
   - Close browser

7. **Store Credentials:**
   ```sql
   UPDATE families
   SET ig_username = 'sarah_gaza_voice',
       ig_password = '[encrypted_password]',
       ig_phone_number = '+1234567890',
       ig_account_created_at = NOW(),
       ig_account_status = 'created'
   WHERE id = 1;
   ```

### Account Creation via Automation (Future)

We can automate this using the `loginWithCredentials` function in reverse:

```javascript
// In server.js - Account creation endpoint
app.post('/api/create-instagram-account', async (req, res) => {
  const { familyId, email, username, password } = req.body;

  // 1. Fetch family's proxy location from database
  const { data: family } = await supabase
    .from('families')
    .select('proxy_city, proxy_country, timezone')
    .eq('id', familyId)
    .single();

  // 2. Initialize automation with family's location
  const sessionId = `create-${username}`;
  const locationConfig = {
    proxy_city: family.proxy_city,
    proxy_country: family.proxy_country,
    timezone: family.timezone
  };

  const bot = new InstagramAutomation([], null, { server: 'proxy' }, sessionId, locationConfig);
  await bot.init();

  // 3. Navigate to signup page
  await bot.page.goto('https://www.instagram.com/accounts/emailsignup/');

  // 4. Fill form (implementation needed)
  // ...

  // 5. Handle phone verification (requires SMS-Activate API integration)
  // ...

  // 6. Store credentials in database (encrypted)
  // ...
});
```

**Note:** This automation is complex and Instagram actively blocks it. Manual creation is more reliable.

---

## Step 4: Account Warm-Up (2 Weeks)

**Critical:** Do NOT hand account to family immediately. Warm it up first to avoid instant suspension.

### Days 1-7: Silent Observation

**Manual browsing (via automation):**
- Login daily
- Scroll feed for 5-10 minutes
- Like 5-10 posts (non-Gaza content)
- Follow 3-5 accounts (human rights, news)
- **DO NOT POST** anything
- **DO NOT ADD** fundraising links

**Why:** Instagram monitors new accounts closely. Silent activity builds trust score.

### Days 8-14: Gradual Gaza Engagement

**Increase Gaza-related activity:**
- Follow 2-3 Gaza accounts per day
- Like Gaza-related posts (5-10 per day)
- Comment on Gaza posts ("Stay strong", "Praying for you")
- **Still NO fundraising links**
- **Still NO posting** original content

### Day 15+: Activate Account

**Now safe to:**
- Add fundraising link to bio (Chuffed.org, LaunchGood)
- Post first story (family introduces themselves)
- Begin automation (comment posting, DMs)
- Hand over credentials to family

---

## Step 5: Credential Handoff to Family

### Secure Communication

**Recommended Method: Signal**
1. Install Signal on your phone
2. Family installs Signal on their phone
3. Share credentials via disappearing message (24-hour timer)

**Format:**
```
Instagram Account Ready! 🇵🇸

Email: sarah_gaza_2026@protonmail.com
Email Password: [password]

Instagram: @sarah_gaza_voice
Instagram Password: [password]

IMPORTANT:
- Account is warmed up and ready
- Fundraising link already added to bio
- Login from your phone (not computer)
- Change passwords after first login if you want
- Contact me if any issues

Keep these safe! Delete this message after saving.
```

**Alternative: Encrypted Email**
- Use ProtonMail to ProtonMail (encrypted by default)
- Send credentials in separate messages (email + password in different emails)

**NOT Recommended:**
- ❌ WhatsApp (Meta owns Instagram, potential risk)
- ❌ Telegram (less secure than Signal)
- ❌ Regular email (unencrypted)
- ❌ SMS (unencrypted)

---

## Security Considerations

### Password Management

**For Email & Instagram Passwords:**
1. Use password manager (1Password, Bitwarden, KeePass)
2. Generate strong passwords (16+ characters, random)
3. Never reuse passwords across accounts
4. Encrypt before storing in database

**Database Storage:**
```javascript
// Encrypt before storing
const crypto = require('crypto');

function encrypt(text) {
  const algorithm = 'aes-256-cbc';
  const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

// Usage
const encryptedPassword = encrypt(plainPassword);
await supabase
  .from('families')
  .update({ ig_password: encryptedPassword })
  .eq('id', familyId);
```

### Account Recovery

**Set up account recovery BEFORE handoff:**
1. Add backup email (your ProtonMail)
2. Note down backup codes (if Instagram offers)
3. Keep copy of credentials (encrypted)

**Why:** If family loses access, you can help recover.

### Two-Factor Authentication (2FA)

**DO NOT enable 2FA initially:**
- Complicates automation
- Families may struggle with 2FA codes
- Can lock them out

**Enable 2FA only if:**
- Family requests it
- Account shows suspicious activity
- After handoff and family is comfortable with account

---

## Bulk Account Creation

### Planning

For 10-15 families:
- **Time:** 30-45 minutes per account (including warm-up setup)
- **Cost:** $0.70 per account (SMS verification)
- **Total Cost:** $7-10 for 10 families
- **Timeline:** Create 1-2 accounts per day (don't rush)

### Schedule

**Week 1:**
- Monday: Create 2 email accounts
- Tuesday: Create 2 Instagram accounts
- Wednesday: Create 2 email accounts
- Thursday: Create 2 Instagram accounts
- Friday: Create 2 email accounts
- Saturday: Create 2 Instagram accounts
- Sunday: Rest

**Week 2:**
- Continue warm-up for Week 1 accounts
- Create remaining accounts

**Week 3:**
- Week 1 accounts ready for handoff
- Week 2 accounts still warming up

### Tracking Spreadsheet

Create a tracking sheet:

| Family Name | Email | IG Username | Email Created | IG Created | Warm-up Status | Handoff Date |
|-------------|-------|-------------|---------------|------------|----------------|--------------|
| Sarah | sarah_gaza_2026@pm.me | sarah_gaza_voice | 2026-01-15 | 2026-01-16 | Day 8/14 | 2026-01-30 |
| Ahmed | ahmed_gaza_2026@pm.me | ahmed_gaza_stories | 2026-01-17 | 2026-01-18 | Day 6/14 | 2026-02-01 |

---

## Troubleshooting

### Email Creation Issues

**Problem:** ProtonMail requires phone verification

**Solution:**
1. Use SMS-Activate to get verification number
2. Purchase "ProtonMail" or "Other" service number
3. Enter code when prompted
4. If still blocked, try Tutanota instead

**Problem:** CAPTCHA keeps failing

**Solution:**
1. Clear browser cookies
2. Try different proxy IP (change session ID)
3. Use manual CAPTCHA solving service (2captcha.com)

### Instagram Creation Issues

**Problem:** "This email is already in use"

**Solution:**
1. Verify email wasn't used before
2. Try different email provider
3. Add +tag to email (e.g., sarah+ig@protonmail.com)

**Problem:** "Phone number invalid"

**Solution:**
1. SMS-Activate number might be blacklisted
2. Cancel and buy new number
3. Try different country (Canada/USA usually work)

**Problem:** Immediate suspension after creation

**Cause:** Usually proxy/location mismatch

**Solution:**
1. Verify proxy is working (check IP: https://ip.decodo.com)
2. Ensure timezone matches proxy city
3. Don't create multiple accounts same day
4. Wait 24 hours between account creations

### Account Warm-Up Issues

**Problem:** Account suspended during warm-up

**Solution:**
1. Too much activity too fast
2. Reduce automation frequency
3. Manual browsing only for first week
4. Appeal suspension (use template in GAZA_ACCOUNT_STRATEGY.md)

---

## Database Management

### View All Accounts

```sql
SELECT
    id,
    family_name,
    ig_email,
    ig_username,
    ig_account_status,
    ig_account_created_at,
    proxy_city
FROM families
ORDER BY ig_account_created_at DESC;
```

### Accounts Pending Creation

```sql
SELECT id, family_name, proxy_city
FROM families
WHERE ig_account_status = 'pending'
OR ig_email IS NULL;
```

### Accounts Ready for Handoff

```sql
SELECT
    id,
    family_name,
    ig_username,
    ig_account_created_at,
    (NOW() - ig_account_created_at) AS days_since_creation
FROM families
WHERE ig_account_status = 'created'
AND ig_account_created_at < NOW() - INTERVAL '14 days';
```

### Mark Account as Handed Off

```sql
UPDATE families
SET ig_account_status = 'active'
WHERE id = 1;
```

---

## Cost Summary

### Per Family

| Item | Cost |
|------|------|
| Email verification (SMS) | $0.30 |
| Instagram verification (SMS) | $0.40 |
| Email account (ProtonMail) | Free |
| Instagram account | Free |
| **Total per family** | **$0.70** |

### For 10 Families

- SMS verification: $7
- Proxy bandwidth (creation): ~2GB = $3.50
- **Total:** ~$10.50

### For 15 Families

- SMS verification: $10.50
- Proxy bandwidth (creation): ~3GB = $5.25
- **Total:** ~$15.75

---

## Best Practices

### Do's

✅ Create 1-2 accounts per day maximum
✅ Use same proxy location for email + Instagram
✅ Complete warm-up period (14 days minimum)
✅ Keep detailed records in spreadsheet
✅ Use strong, unique passwords
✅ Encrypt all credentials in database
✅ Hand off via Signal (encrypted)

### Don'ts

❌ Create multiple accounts same day
❌ Skip warm-up period
❌ Add fundraising links immediately
❌ Use same email/username pattern (vary them)
❌ Share credentials via WhatsApp/SMS
❌ Enable 2FA before handoff
❌ Post Gaza content first week

---

## Summary

**Process:**
1. **Email Creation** → ProtonMail (30 min/account)
2. **Instagram Creation** → Via proxy (30 min/account)
3. **Warm-up** → 14 days automated browsing
4. **Handoff** → Signal encrypted message

**Timeline:**
- Day 0: Create email + Instagram account
- Days 1-7: Silent observation (automated)
- Days 8-14: Gradual Gaza engagement (automated)
- Day 15: Add fundraising link, hand off to family

**Cost:**
- $0.70 per family (SMS verification)
- ~$1/family total (including proxy bandwidth)

**Files Modified:**
- `migrations.sql` - Migration 3 (account columns)
- `ACCOUNT_CREATION_GUIDE.md` - This guide

---

**Every account created is another voice amplified. Every family connected is another story that refuses to be silenced.**

🇵🇸
