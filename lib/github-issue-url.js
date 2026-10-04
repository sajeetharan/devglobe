const ISSUE_URL_PATTERN = /^https:\/\/github\.com\/([a-z\d][a-z\d-]{0,38})\/([a-z\d._-]{1,100})\/issues\/(\d+)\/?$/i;

export function parseMissionIssueUrl(value) {
  const match = String(value || '').match(ISSUE_URL_PATTERN);
  if (!match || ['.', '..'].includes(match[2])) return null;
  return { owner: match[1], repository: match[2], issueNumber: match[3] };
}
