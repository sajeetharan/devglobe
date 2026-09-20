const BOT_PATTERN = /bot|crawler|spider|preview|slurp|facebookexternalhit|linkedinbot|twitterbot|whatsapp|discordbot/i;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export function isAutomatedUserAgent(userAgent) {
  return !userAgent || BOT_PATTERN.test(String(userAgent));
}

export function shouldCollectBrowserTelemetry({ hostname, userAgent }) {
  return !LOCAL_HOSTS.has(String(hostname || '').toLowerCase()) && !isAutomatedUserAgent(userAgent);
}
