export function selectGitHubEmail(profileEmail, emails = []) {
  const verifiedEmails = Array.isArray(emails)
    ? emails.filter(email => email?.verified && typeof email.email === 'string' && email.email.trim())
    : [];
  const primary = verifiedEmails.find(email => email.primary);
  return primary?.email.trim() || String(profileEmail || '').trim() || verifiedEmails[0]?.email.trim() || null;
}