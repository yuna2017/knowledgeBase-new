import { handleViews } from '../../shared/views.js'

// Compatibility endpoint; all business logic lives in shared/views.js.
function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || ''
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((value) => value.trim())
  return {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
    ...(origin && allowed.includes(origin) ? { 'Access-Control-Allow-Origin': origin } : {})
  }
}

export default {
  fetch(request, env) {
    const headers = corsHeaders(request, env)
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    return handleViews(request, env, headers)
  }
}
