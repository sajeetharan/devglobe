const ALLOWED_ORIGINS = new Set([
  'https://www.devglobe.dev',
  'https://devglobe.dev',
  'http://localhost:3000',
]);

function corsHeaders(request) {
  const origin = request.headers?.origin;
  return {
    ...(ALLOWED_ORIGINS.has(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

function json(request, body, status = 200, cacheControl = 'public, max-age=60') {
  return {
    status,
    headers: {
      ...corsHeaders(request),
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cacheControl,
    },
    body,
  };
}

module.exports = { corsHeaders, json };