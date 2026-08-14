import { getSiteUrl } from './site.js';

const RESEND_API_URL = 'https://api.resend.com/emails';
const REPOSITORY_URL = 'https://github.com/sajeetharan/devglobe';

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function profileUrl(login) {
  return `${getSiteUrl()}/developer/${encodeURIComponent(login)}`;
}

function emailLayout({ preview, heading, greeting, body, login, action }) {
  const url = profileUrl(login);
  const logoUrl = `${getSiteUrl()}/devglobe.png`;
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f3f6f4;color:#17211b;font-family:Arial,sans-serif">
    <div style="display:none;max-height:0;overflow:hidden">${escapeHtml(preview)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f6f4;padding:32px 16px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #dce5df">
          <tr><td style="padding:24px 32px 12px">
            <img src="${escapeHtml(logoUrl)}" width="48" height="48" alt="DevGlobe" style="display:block;width:48px;height:48px;object-fit:contain;border:0">
          </td></tr>
          <tr><td style="padding:0 32px 8px;font-size:28px;font-weight:700;line-height:1.2">${escapeHtml(heading)}</td></tr>
          <tr><td style="padding:12px 32px 0;font-size:16px;line-height:1.6">Hi ${escapeHtml(greeting)},</td></tr>
          <tr><td style="padding:8px 32px 24px;font-size:16px;line-height:1.6">${escapeHtml(body)}</td></tr>
          <tr><td style="padding:0 32px 28px">
            <a href="${escapeHtml(url)}" style="display:inline-block;background:#117a4b;color:#ffffff;padding:12px 18px;text-decoration:none;font-weight:700">${escapeHtml(action)}</a>
          </td></tr>
          <tr><td style="padding:20px 32px;border-top:1px solid #e7ece9;font-size:15px;line-height:1.6">
            <strong>Built by developers, with developers.</strong><br>
            DevGlobe is open source. Help improve developer discovery, profiles, and agent collaboration by contributing code, ideas, or documentation.<br>
            <a href="${REPOSITORY_URL}" style="color:#117a4b;font-weight:700">Contribute on GitHub</a>
          </td></tr>
          <tr><td style="padding:20px 32px;border-top:1px solid #e7ece9;color:#5c6b62;font-size:13px;line-height:1.5">Explore your developer profile, AI collaboration settings, rankings, and activity on DevGlobe.</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

export function buildClaimWelcomeEmail({ login, name }) {
  const greeting = name || login;
  const url = profileUrl(login);
  return {
    subject: 'Your DevGlobe profile is claimed',
    text: `Hi ${greeting},\n\nYour DevGlobe profile is now claimed and under your control. Explore your profile, add your AI collaboration preferences, and see your activity and rankings.\n\nOpen your profile: ${url}\n\nDevGlobe is open source. Contribute code, ideas, or documentation: ${REPOSITORY_URL}\n\nDevGlobe`,
    html: emailLayout({
      preview: 'Your DevGlobe profile is now under your control.',
      heading: 'Your profile is claimed',
      greeting,
      body: 'Your DevGlobe profile is now under your control. Explore your activity and rankings, then add your AI collaboration preferences so agents and developers know how you like to work.',
      login,
      action: 'Explore your profile',
    }),
  };
}

export function buildNominationApprovedEmail({ login, name }) {
  const greeting = name || login;
  const url = profileUrl(login);
  return {
    subject: 'Your DevGlobe nomination was approved',
    text: `Hi ${greeting},\n\nYour nomination was approved and your DevGlobe profile is now public. Explore your profile, review your developer metrics, and claim it to unlock profile controls and AI collaboration preferences.\n\nView your profile: ${url}\n\nDevGlobe is open source. Contribute code, ideas, or documentation: ${REPOSITORY_URL}\n\nDevGlobe`,
    html: emailLayout({
      preview: 'Your nomination was approved and your profile is live.',
      heading: 'You are live on DevGlobe',
      greeting,
      body: 'Your nomination was approved and your profile is now public. Review your developer metrics, share your profile, and claim it to unlock profile controls and AI collaboration preferences.',
      login,
      action: 'View your profile',
    }),
  };
}

export async function sendLifecycleEmail({ to, message, idempotencyKey, fetchImpl = fetch }) {
  const recipient = String(to || '').trim();
  if (!recipient) return { sent: false, reason: 'missing_recipient' };

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !from) return { sent: false, reason: 'not_configured' };

  const response = await fetchImpl(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from,
      to: [recipient],
      subject: message.subject,
      text: message.text,
      html: message.html,
    }),
  });

  if (!response.ok) {
    throw new Error(`Email provider returned status ${response.status}`);
  }

  const result = await response.json();
  return { sent: true, id: result.id || null };
}