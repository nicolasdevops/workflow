// Deploy this to Cloudflare Workers (free)
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  
  // Rate limiting
  const ip = request.headers.get('CF-Connecting-IP')
  const rateLimitKey = `rate_limit:${ip}`
  const requests = await RATE_LIMIT.get(rateLimitKey) || 0
  
  if (requests > 100) {
    return new Response('Rate limited', { status: 429 })
  }
  
  await RATE_LIMIT.put(rateLimitKey, parseInt(requests) + 1, { expirationTtl: 3600 })
  
  // Route to appropriate handler
  switch(url.pathname) {
    case '/api/register-family':
      return handleFamilyRegistration(request)
    case '/api/get-task':
      return handleGetTask(request)
    case '/api/complete':
      return handleComplete(request)
    default:
      return new Response('Not found', { status: 404 })
  }
}

async function handleFamilyRegistration(request) {
  const data = await request.json()
  
  // Validate family data
  if (!data.name || !data.instagram_handle) {
    return new Response('Missing required fields', { status: 400 })
  }
  
  // Generate unique API key
  const apiKey = crypto.randomUUID()
  
  // Save to Supabase
  const response = await fetch(SUPABASE_URL + '/rest/v1/families', {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      ...data,
      api_key: apiKey
    })
  })
  
  return new Response(JSON.stringify({ api_key: apiKey }), {
    headers: { 'Content-Type': 'application/json' }
  })
}
