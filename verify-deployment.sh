#!/bin/bash

# Gaza Protocol Deployment Verification Script
# Run this after deploying to Railway to verify everything works

echo "==================================="
echo "Gaza Protocol Deployment Verification"
echo "==================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get Railway URL from user
echo "Enter your Railway deployment URL (e.g., https://your-project.up.railway.app):"
read RAILWAY_URL

if [ -z "$RAILWAY_URL" ]; then
    echo -e "${RED}Error: URL is required${NC}"
    exit 1
fi

echo ""
echo "Testing deployment at: $RAILWAY_URL"
echo ""

# Test 1: Check if N8N is responding
echo -n "1. Testing N8N availability... "
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$RAILWAY_URL" -m 10)

if [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✓ PASS${NC} (HTTP $HTTP_CODE - N8N is running)"
else
    echo -e "${RED}✗ FAIL${NC} (HTTP $HTTP_CODE - N8N not responding)"
    exit 1
fi

# Test 2: Check healthcheck endpoint
echo -n "2. Testing health endpoint... "
HEALTH_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$RAILWAY_URL/healthz" -m 10)

if [ "$HEALTH_CODE" = "200" ]; then
    echo -e "${GREEN}✓ PASS${NC} (N8N is healthy)"
else
    echo -e "${YELLOW}⚠ WARNING${NC} (Healthcheck returned $HEALTH_CODE)"
fi

# Test 3: Check if Playwright is installed (requires N8N credentials)
echo ""
echo "3. Checking Playwright installation..."
echo "   (This requires N8N login - checking via Railway logs)"
echo -e "${YELLOW}   → Please verify manually in Railway logs:${NC}"
echo "      Look for: 'playwright install firefox' in build logs"

# Test 4: Environment variables check
echo ""
echo "4. Environment Variables Checklist:"
echo "   Please verify these are set in Railway:"
echo "   - N8N_BASIC_AUTH_USER"
echo "   - N8N_BASIC_AUTH_PASSWORD"
echo "   - SUPABASE_URL"
echo "   - SUPABASE_ANON_KEY"
echo "   - SUPABASE_SERVICE_KEY"
echo "   - TIMEZONE (should be 'Asia/Gaza')"
echo "   - OPERATION_START_HOUR (should be 8)"
echo "   - OPERATION_END_HOUR (should be 18)"

echo ""
echo "==================================="
echo "Deployment Status"
echo "==================================="
echo ""

if [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✓ Deployment appears successful!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Visit: $RAILWAY_URL"
    echo "2. Log in with your N8N credentials"
    echo "3. Import workflows from family_workflow.json"
    echo "4. Test with one family account first"
    echo ""
else
    echo -e "${RED}✗ Deployment has issues${NC}"
    echo ""
    echo "Troubleshooting:"
    echo "1. Check Railway logs for errors"
    echo "2. Verify Dockerfile built successfully"
    echo "3. Confirm environment variables are set"
    echo ""
fi

echo "Full verification complete!"
