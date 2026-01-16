// Cloudflare Function to proxy Google Gemini API requests and add CORS headers
export async function onRequest(context) {
    const { request, env } = context
    const url = new URL(request.url)

    // Extract the path after /api/google/
    const path = url.pathname.replace('/api/google/', '')
    const googleUrl = `https://generativelanguage.googleapis.com/${path}${url.search}`

    // Forward the request to Google API
    const googleRequest = new Request(googleUrl, {
        method: request.method,
        headers: {
            'Content-Type': 'application/json',
            // The API key is usually passed as a query param or in a header
            // We'll pass through what the client sends
        },
        body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : null,
    })

    try {
        const response = await fetch(googleRequest)

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
