export async function onRequest(context) {
  const { request, env } = context
  const url = new URL(request.url)
  
  // Extract the path after /api/replicate/
  const path = url.pathname.replace('/api/replicate/', '')
  const replicateUrl = `https://api.replicate.com/v1/${path}${url.search}`
  
  // Forward the request to Replicate API
  const replicateRequest = new Request(replicateUrl, {
    method: request.method,
    headers: {
      'Authorization': request.headers.get('Authorization') || `Token ${env.VITE_REPLICATE_API_KEY}`,
      'Content-Type': request.headers.get('Content-Type') || 'application/json',
    },
    body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : null,
  })
  
  try {
    const response = await fetch(replicateRequest)
    
    // Create a new response with CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }
    
    // Handle OPTIONS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      })
    }
    
    // Clone the response and add CORS headers
    const responseBody = await response.text()
    const newResponse = new Response(responseBody, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        ...corsHeaders,
        'Content-Type': response.headers.get('Content-Type') || 'application/json',
      },
    })
    
    return newResponse
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }
}

