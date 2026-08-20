function escapeMarkdown(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/([`*_{}\[\]()#+.!|<>-])/g, '\\$1');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function compact(values) {
  return values.filter(Boolean);
}

function number(value) {
  if (value === null || value === undefined || value === '') return null;
  return Number.isFinite(Number(value)) ? Number(value).toLocaleString('en-US') : null;
}

function profileUrl(siteUrl, login) {
  return `${siteUrl.replace(/\/$/, '')}/share/${encodeURIComponent(login)}`;
}

export function resolveReadmeAccess(developer, user, claimed = false) {
  if (!user) return 'sign-in';
  if (user.login?.toLowerCase() !== developer.login?.toLowerCase()) return 'unavailable';
  return claimed || developer.claimed ? 'generate' : 'claim';
}

export function defaultReadmeAbout(developer) {
  if (developer.bio) return escapeMarkdown(developer.bio);

  const focus = developer.topLanguage ? `${escapeMarkdown(developer.topLanguage)} and open source` : 'open source';
  const location = developer.location ? ` based in ${escapeMarkdown(developer.location)}` : '';
  return `I am a developer focused on ${focus}${location}.`;
}

export function generateProfileReadme(developer, options = {}) {
  if (!developer?.login) throw new TypeError('A developer login is required');

  const login = developer.login;
  const encodedLogin = encodeURIComponent(login);
  const siteUrl = (options.siteUrl || 'https://www.devglobe.dev').replace(/\/$/, '');
  const devglobeUrl = profileUrl(siteUrl, login);
  const name = escapeMarkdown(developer.name || login);
  const alt = escapeHtml(developer.name || login);
  const about = options.about?.trim() || defaultReadmeAbout(developer);
  const lines = [
    '<div align="center">',
    '',
    `<img src="https://github.com/${encodedLogin}.png" width="120" alt="${alt}" />`,
    '',
    `# Hi, I'm ${name}`,
    '',
    `[![DevGlobe profile](${siteUrl}/api/badge/${encodedLogin}.svg)](${devglobeUrl})`,
    '',
    '</div>',
    '',
    '## About me',
    '',
    about,
  ];

  const highlights = compact([
    developer.location && `- Based in **${escapeMarkdown(developer.location)}**`,
    developer.topLanguage && `- Most-used language: **${escapeMarkdown(developer.topLanguage)}**`,
    developer.globalRank && `- Ranked **#${number(developer.globalRank)} globally** on [DevGlobe](${devglobeUrl})`,
    developer.countryRank && developer.country && `- Ranked **#${number(developer.countryRank)} in ${escapeMarkdown(developer.country)}**`,
  ]);
  if (highlights.length) lines.push('', ...highlights);

  const metrics = compact([
    number(developer.totalStars) !== null && ['Stars', number(developer.totalStars)],
    number(developer.totalCommits) !== null && ['Commits', number(developer.totalCommits)],
    number(developer.followers) !== null && ['Followers', number(developer.followers)],
    Number(developer.soReputation) > 0 && ['Stack Overflow reputation', number(developer.soReputation)],
  ]);
  if (metrics.length) {
    lines.push('', '## Open-source snapshot', '', '| Metric | Value |', '| --- | ---: |');
    for (const [label, value] of metrics) lines.push(`| ${label} | ${value} |`);
  }

  const languages = (developer.languages || [])
    .map(language => typeof language === 'string' ? language : language?.name)
    .filter(Boolean)
    .slice(0, 8);
  if (languages.length) {
    lines.push('', '## Languages', '', languages.map(escapeMarkdown).join(' · '));
  }

  const repositories = (developer.topRepos || []).filter(repository => repository?.name).slice(0, 5);
  if (repositories.length) {
    lines.push('', '## Featured projects', '');
    for (const repository of repositories) {
      const repositoryUrl = repository.url || `https://github.com/${encodedLogin}/${encodeURIComponent(repository.name)}`;
      const description = repository.description ? ` — ${escapeMarkdown(repository.description)}` : '';
      const stars = Number(repository.stars) > 0 ? ` (${number(repository.stars)} stars)` : '';
      lines.push(`- [${escapeMarkdown(repository.name)}](${repositoryUrl})${stars}${description}`);
    }
  }

  lines.push('', '## Connect', '', `- [GitHub](https://github.com/${encodedLogin})`, `- [DevGlobe](${devglobeUrl})`);
  if (developer.soUserId) lines.push(`- [Stack Overflow](https://stackoverflow.com/users/${encodeURIComponent(developer.soUserId)})`);

  lines.push('', '---', '', `<sub>Generated with [DevGlobe](${siteUrl})</sub>`, '');
  return lines.join('\n');
}
