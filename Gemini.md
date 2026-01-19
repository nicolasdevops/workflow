# Project Status: Gaza Protocol - Family Connect

## 1. Project Overview
**Goal:** Automate social media management for Gaza families to generate forensic-quality testimonies, engage with followers, and raise awareness/funds via Instagram.
**Current Phase:** Phase 1 (Portal & Basic Automation) Complete. Ready for Phase 2 (Reel Generation).

## 2. Technical Architecture
- **Frontend:** Single Page Application (SPA) using Vue.js 3 (CDN) and Tailwind CSS. Mobile-first design optimized for low-bandwidth and small screens (Galaxy S8).
- **Backend:** Node.js + Express server.
- **Database:** Supabase (PostgreSQL) for user profiles, family details, and encrypted session cookies.
- **Automation Engine:** Playwright (Firefox) for Instagram interaction (Login, 2FA, Scraping, Posting).
- **AI Engine:** You.com API (Custom Agent) for generating comments and DMs.
- **Hosting:** Railway (using Nixpacks) behind Cloudflare.

## 3. Key Decisions & Implementation Details

### UI/UX (Portal)
- **Bilingual Interface:** All labels, placeholders, and buttons are English | Levantine Arabic.
- **Styling:** Specific color theme `#3274B5`. Compact layout for mobile.
- **Features:**
  - **Login/Register:** Secure auth with Supabase.
  - **Profile Management:** Detailed family tracking (Housing type, Displacement count, Urgent needs, Family members with bilingual gender/age).
  - **Instagram Connection:** Headless browser login via Playwright, handling 2FA and storing encrypted cookies.
  - **Media Upload:** Direct upload to Supabase Storage for AI Reel generation.
  - **Stats Dashboard:** Real-time display of AI Comments, DMs, Reels, and Active Days.

### Instagram Automation (`instagram-automation.js`)
- **Strategy:** Browser automation (Playwright) simulating human behavior (mouse movements, typing typos).
- **Scraping:** 
  - Supports **Guest Mode** (public view) and **Authenticated Mode** (using saved cookies).
  - Robust popup handling (Cookie consent, Login walls, App upsells) using aggressive selector checks and direct URL navigation.
- **Selectors:** Updated to handle obfuscated Instagram class names (e.g., `_ac7v`, `x1lliihq`).

### AI Agent (`youcom-agent.js`)
- **Persona:** "Virgin Mary-meet-Indiana Jones" – Ancient, street-wise, dignified, forensic.
- **Context Injection:** Dynamically injects specific family details (names, medical conditions) into the prompt.
- **Comment Bank:** Uses `list_of_comments.txt` (54 high-quality testimonies) as a style reference.
- **Constraints:** Strict word limit (max 35 words), no hashtags, no direct begging.

### Deployment
- **Railway:** Configured using `railway.json` and `nixpacks.toml` (removed Dockerfile to force Nixpacks build).
- **Caching:** `server.js` configured to disable caching for `index.html` during development/updates.

## 4. Current File Structure & Key Files

- **`server.js`**: Main entry point. Handles API routes (`/api/login`, `/api/portal/*`), static serving, and automation triggers.
- **`public/index.html`**: The frontend application.
- **`instagram-automation.js`**: Class for handling all Playwright interactions.
- **`youcom-agent.js`**: Class for interacting with You.com API.
- **`encryption.js`**: AES-256-GCM encryption for storing Instagram cookies.
- **`test-ai-comments-dry-run.js`**: Integration test script that fetches a family, logs into Instagram (if needed), scrapes top accounts, and generates AI comments.
- **`list_of_comments.txt`**: Source material for AI style transfer.

## 5. Pending Tasks (Next Steps)

### Immediate Priority: Node 9 - Reel Generation Engine
1.  **Media Processing:**
    -   Fetch uploaded media from Supabase Storage.
    -   Use `ffmpeg` (needs to be added to Nixpacks) to process video.
2.  **AI Scripting:**
    -   Use You.com agent to generate a narration script based on the video context + family profile.
3.  **Voice Synthesis:**
    -   Integrate a TTS (Text-to-Speech) service (e.g., ElevenLabs or OpenAI) to voice the narration.
4.  **Assembly:**
    -   Overlay audio onto video.
    -   Add subtitles (optional but recommended).

### Subsequent Tasks
-   **Node 7 (DM Automation):** Logic to reply to DMs and initiate contact with new followers.
-   **Node 10 (Metrics):** Track views, likes, and engagement in Supabase.

## 6. Environment Variables Required
```env
PORT=3000
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=...

SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...

YOUCOM_API_KEY=...
YOUCOM_AGENT_ID=...

ENCRYPTION_KEY=... (32-byte hex)

# Optional (for testing/burners)
IG_USERNAME=...
IG_PASSWORD=...

# Email
SMTP_HOST=...
SMTP_PORT=...
SMTP_USER=...
SMTP_PASS=...
```

## 7. Useful Commands

**Run Local Server:**
```bash
npm start
```

**Run AI/Scrape Test:**
```bash
node test-ai-comments-dry-run.js
```

**Deploy to Railway:**
```bash
git add .
git commit -m "Update"
git push origin main
```