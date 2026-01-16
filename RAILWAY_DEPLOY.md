# Railway Deployment Guide

## Prerequisites

1. Railway account (railway.app)
2. Supabase account with database created
3. GitHub repository with this code

## Step 1: Prepare Supabase

1. Go to your Supabase project
2. Navigate to SQL Editor
3. Run the contents of `for_supabase.sql` to create tables
4. Go to Settings > API
5. Copy these values (you'll need them):
   - `Project URL` (SUPABASE_URL)
   - `anon/public` key (SUPABASE_ANON_KEY)
   - `service_role` key (SUPABASE_SERVICE_KEY)

## Step 2: Deploy to Railway

1. Go to railway.app and log in
2. Click "New Project" > "Deploy from GitHub repo"
3. Select this repository
4. Railway will detect the Dockerfile and start building

## Step 3: Configure Environment Variables

In Railway project settings, add these environment variables:

```
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=YourSecurePassword123!

SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

YOUCOM_API_KEY=your_youcom_api_key_here

TIMEZONE=Asia/Gaza
OPERATION_START_HOUR=8
OPERATION_END_HOUR=18
```

## Step 4: Generate a Domain

1. In Railway project, go to Settings
2. Click "Generate Domain"
3. Copy the domain (e.g., `your-project.up.railway.app`)

## Step 5: Access N8N

1. Go to `https://your-project.up.railway.app`
2. Log in with your N8N credentials
3. You should see the N8N interface

## Step 6: Verify Deployment

Check these things work:

- [ ] N8N interface loads
- [ ] Can connect to Supabase (check Database node)
- [ ] Playwright is installed (try running a browser node)

## Troubleshooting

### Build fails with "command not found"
- Make sure Dockerfile uses `apt-get` not `apk`
- Verify all dependencies are in the RUN commands

### N8N doesn't start
- Check environment variables are set correctly
- Look at Railway logs for error messages

### Can't connect to Supabase
- Verify SUPABASE_URL includes `https://`
- Check your Supabase project isn't paused (free tier goes to sleep)

### Playwright errors
- Ensure `npx playwright install firefox --with-deps` ran during build
- Check Railway logs for missing system dependencies

## Cost Estimate

Railway pricing (as of 2026):
- Free trial: $5 credit
- Hobby plan: $5/month for 500 hours
- Pro plan: $20/month for unlimited hours

Expected usage: ~$5-10/month depending on automation frequency.

## Next Steps

After successful deployment:
1. Import N8N workflows from JSON files
2. Set up family accounts in Supabase
3. Test with one family first
4. Scale to all 15 families
