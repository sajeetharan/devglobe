export const CONTRIBUTION_TASK_PREFERENCES = ['any', 'code', 'content'];

export function contributionTask(issue) {
  const title = String(issue?.title || '');
  const body = String(issue?.body || '').slice(0, 20000);
  const labels = (issue?.labels || []).map(label => String(label?.name || label)).join(' ');
  const summary = `${title} ${labels}`;
  const text = `${summary} ${body}`;
  const noCode = /\bno (?:coding|code|coding experience)\b|\b(?:don['\u2019]t|do not) need to\b[^.\n]{0,80}\bwrite code\b/i.test(text);
  if (/\bjson\b|\.json\b/i.test(text) && (noCode || /\b(?:json(?:\/data)? file edit|edit (?:a |the )?json file|add (?:a |new )?fact)\b/i.test(text))) {
    return { kind: 'content', label: 'JSON/content edit' };
  }
  if (noCode || /\b(?:add (?:a |new )?(?:fact|translation)|translate|translation)\b/i.test(summary)) {
    return { kind: 'content', label: 'Content edit' };
  }
  if (/\b(?:documentation|docs|readme|typo)\b/i.test(summary)) {
    return { kind: 'content', label: 'Documentation edit' };
  }
  if (/\b(?:implement|refactor|bug|test coverage|unit tests?|fix.*(?:parser|function|component)|feature)\b/i.test(summary)) {
    return { kind: 'code', label: 'Code change' };
  }
  return { kind: 'unknown', label: 'Task: check issue details' };
}

function repositoryGuideUrl(value, repository) {
  if (typeof value !== 'string' || !repository?.full_name) return null;
  const base = `https://github.com/${repository.full_name}/issues/`;
  if (!URL.canParse(value, base)) return null;
  const url = new URL(value, base);
  const prefix = `/${repository.full_name}/`;
  if (url.protocol !== 'https:' || url.host !== 'github.com' || url.username || url.password
    || !url.pathname.startsWith(prefix)
    || !/^(?:blob|tree)\//.test(url.pathname.slice(prefix.length))) return null;
  return url.href;
}

export function contributionGuideUrl(issue, repository, fallback) {
  const body = String(issue?.body || '').slice(0, 20000);
  for (const match of body.matchAll(/\[([^\]\n]+)\]\(([^)\s]+)\)/g)) {
    if (!/\bcontribut(?:ing|ion|e)|\bbeginner.*guide\b/i.test(match[1])) continue;
    const url = repositoryGuideUrl(match[2], repository);
    if (url) return url;
  }
  return repositoryGuideUrl(fallback, repository);
}
