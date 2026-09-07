const TOKEN_ENDPOINT = 'https://github.com/login/oauth/access_token';

export async function verifyGitHubOAuthCredentials({ clientId, clientSecret, fetchImpl = fetch } = {}) {
  if (!clientId || !clientSecret) throw new TypeError('GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are required');

  const response = await fetchImpl(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code: 'devglobe-oauth-credential-health-check',
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (result.error === 'bad_verification_code') return { valid: true, reason: result.error };
  if (result.error === 'incorrect_client_credentials') return { valid: false, reason: result.error };
  if (!response.ok) return { valid: false, reason: `http_${response.status}` };
  throw new Error(`Unexpected GitHub OAuth response: ${result.error || 'missing error code'}`);
}