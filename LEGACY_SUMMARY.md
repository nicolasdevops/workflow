# Gaza Protocol - Legacy Summary

## Project Overview
Instagram automation system for humanitarian aid - creates/managed accounts for Gaza families to amplify their voices. Uses Playwright, Supabase, mobile proxies (Decodo), Railway deployment.

## Architecture
- **Core**: Node.js + Playwright for browser automation
- **Database**: Supabase PostgreSQL with 18 tables (families, accounts, comments, engagement tracking)
- **Proxy**: Decodo mobile proxies with per-family session isolation
- **Deployment**: Railway + n8n workflows
- **AI**: You.com agents for comment generation, ElevenLabs for voice

## Database Schema (Key Tables)
- `families`: Family profiles with proxy location, city targeting
- `mothers_profiles`/`mothers_content`: Instagram accounts and content
- `comment_templates`/`posted_comments`: AI-generated and deployed comments
- `engaged_followers`/`engagement_quality_report`: Engagement tracking
- `proxy_cities`: Available proxy locations
- `target_accounts`/`target_posts`: Gaza-related content targets
- `warmup_status`: Account warm-up phase tracking

## Proxy Configuration
- **Provider**: Decodo mobile proxies (fail-closed behavior)
- **Session**: 60-minute sticky sessions per family
- **Location**: Per-family city targeting (Montreal, Toronto, London, etc.)
- **Bandwidth**: ~0.5GB/account creation, ~1-2GB/month active use
- **Cost**: ~$7-17/month per family depending on usage

## Account Strategy
- **Creation**: ProtonMail + SMS-Activate for verification
- **Warm-up**: 14-day phased approach (Days 1-7 silent, Days 8-14 gradual engagement)
- **Persona**: Gaza diaspora/supporter accounts with authentic profiles
- **Safety**: 4 automation switches, human behavior simulation, bandwidth optimization

## Video Generation Workflow
1. **Story**: You.com agent generates authentic Gaza stories
2. **Voice**: ElevenLabs with custom voice design
3. **Video**: Runway Gen-4.5 or Kling 2.6 for animation
4. **Assembly**: Creatomate for final reel composition
5. **Publish**: Automated Instagram Reel posting
- **Cost**: ~$2-4 per reel
- **Time**: 15-30 minutes per reel

## Key Environment Variables
```
SUPABASE_URL, SUPABASE_SERVICE_KEY
DECODO_PROXY_HOST, DECODO_PROXY_PORT, DECODO_PROXY_USERNAME, DECODO_PROXY_PASSWORD
YOUCOM_API_KEY, ELEVENLABS_API_KEY
RAILWAY_TOKEN, APIFY_API_KEY
```

## Daily Operations
- 6:00 AM: Morning warm-up
- 12:00 PM: Midday engagement
- 6:00 PM: Evening engagement
- 11:00 PM: Night warm-up
- Every 30 min: Health checks

## Bandwidth Optimization
- Data Saver mode headers
- Block Facebook trackers/CDN
- 30-60 second scroll duration
- Image quality reduction
- Reduces usage by ~60%

## Security Features
- Fail-closed proxy (no bypass)
- Per-family session isolation
- Device-type matching (Android/iOS)
- Timezone synchronization
- Encrypted credentials

## Deployment Checklist
1. Supabase setup with migrations
2. Railway environment variables
3. Decodo proxy credentials
4. n8n workflow import
5. Test automation locally
6. Deploy to Railway
7. Monitor logs for proxy/session issues

## Cost Estimates
- **Proxy**: $7-17/month per family
- **SMS Verification**: $0.50-3 per account
- **Email**: Free (ProtonMail)
- **AI Comments**: ~$0.01 per comment
- **Video Reels**: $2-4 per reel
- **Total per family/month**: $20-50 (active use)

## Troubleshooting
- "NO PROXY CONFIGURED": Check Railway env vars
- "Device mismatch": Verify mobile proxy settings
- "Session expired": Normal after 60 min, auto-reconnects
- High bandwidth: Enable optimization flags
- Account limits: Check warm-up phase status

## File Structure
```
instagram-automation.js  # Core automation logic
server.js                # API endpoints
youcom-agent.js          # AI comment generation
apify-scraper.js         # Instagram data scraping
comment-scheduler.js     # Comment timing
engagement-tracker.js    # Metrics tracking
warmup-scheduler.js      # Account warm-up
b2-storage.js            # Backblaze media storage
```

## Changelog Highlights
- 2026-02-10: Per-family proxy location targeting
- 2026-02-08: Apify Instagram scraper integration
- 2026-02-06: Automation switches & city rotation
- 2026-02-05: Bandwidth optimization, Data Saver mode
- 2026-02-04: Decodo proxy setup with fail-closed behavior

## Next Steps (From Gemini.md)
- Node 9: Reel generation engine
- Complete video workflow automation
- Scale to 10+ families
- Performance optimization

## Token Usage Strategy

### Strategy
To avoid `loop_detected` errors and excessive token consumption:

1. **Concise Context**: Avoid re-reading large files unnecessarily if already read in the current session or have a strong mental model.
2. **Targeted Searches**: Use `search_file_content` with specific patterns rather than reading entire files when looking for small snippets.
3. **Atomic Actions**: Group related file operations and shell commands to minimize the number of turns.
4. **Strict Output Limits**: Rely on `run_shell_command` output truncation or use specific flags (like `git log -n 3`) to keep tool outputs small.
5. **Memory Management**: Focus only on the active task and not "hallucinate" or over-analyze past interactions unless relevant to the immediate bug fix.

### Monitoring
- Internally monitoring the length of conversation and the complexity of tool calls.
- If a task requires more than 3-4 turns of "thinking" without action, stop and ask for clarification or simplified scope.

---
*Consolidated from 16 markdown files. For full details, see original documentation.*
