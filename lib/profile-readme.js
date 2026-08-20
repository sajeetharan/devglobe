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

// Shields.io escaping for the left-hand label of a badge.
function shieldLabel(value) {
  return String(value)
    .replace(/-/g, '--')
    .replace(/_/g, '__')
    .replace(/ /g, '%20')
    .replace(/#/g, '%23')
    .replace(/\+/g, '%2B')
    .replace(/&/g, '%26');
}

const LANGUAGE_BADGES = {
  typescript: ['TypeScript', '3178C6', 'typescript', 'white'],
  javascript: ['JavaScript', 'F7DF1E', 'javascript', 'black'],
  python: ['Python', '3776AB', 'python', 'white'],
  'c#': ['C%23', '512BD4', 'csharp', 'white'],
  csharp: ['C%23', '512BD4', 'csharp', 'white'],
  java: ['Java', 'ED8B00', 'openjdk', 'white'],
  go: ['Go', '00ADD8', 'go', 'white'],
  golang: ['Go', '00ADD8', 'go', 'white'],
  rust: ['Rust', '000000', 'rust', 'white'],
  'c++': ['C%2B%2B', '00599C', 'cplusplus', 'white'],
  c: ['C', 'A8B9CC', 'c', 'black'],
  ruby: ['Ruby', 'CC342D', 'ruby', 'white'],
  php: ['PHP', '777BB4', 'php', 'white'],
  swift: ['Swift', 'FA7343', 'swift', 'white'],
  kotlin: ['Kotlin', '7F52FF', 'kotlin', 'white'],
  dart: ['Dart', '0175C2', 'dart', 'white'],
  html: ['HTML5', 'E34F26', 'html5', 'white'],
  css: ['CSS3', '1572B6', 'css3', 'white'],
  shell: ['Shell', '4EAA25', 'gnubash', 'white'],
  scala: ['Scala', 'DC322F', 'scala', 'white'],
  elixir: ['Elixir', '4B275F', 'elixir', 'white'],
  haskell: ['Haskell', '5D4F85', 'haskell', 'white'],
  r: ['R', '276DC3', 'r', 'white'],
  vue: ['Vue.js', '4FC08D', 'vuedotjs', 'white'],
  react: ['React', '61DAFB', 'react', 'black'],
  angular: ['Angular', 'DD0031', 'angular', 'white'],
  'node.js': ['Node.js', '339933', 'nodedotjs', 'white'],
  nodejs: ['Node.js', '339933', 'nodedotjs', 'white'],
};

function languageBadge(name) {
  const known = LANGUAGE_BADGES[String(name).trim().toLowerCase()];
  if (known) {
    const [label, color, logo, logoColor] = known;
    return `![${escapeMarkdown(name)}](https://img.shields.io/badge/${label}-${color}?style=flat-square&logo=${logo}&logoColor=${logoColor})`;
  }
  return `![${escapeMarkdown(name)}](https://img.shields.io/badge/${shieldLabel(name)}-555555?style=flat-square)`;
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
  const about = options.about?.trim() || defaultReadmeAbout(developer);
  const tagline = developer.topLanguage
    ? `${escapeMarkdown(developer.topLanguage)} developer${developer.location ? ` · ${escapeMarkdown(developer.location)}` : ''}`
    : (developer.location ? escapeMarkdown(developer.location) : 'Open-source developer');

  // Use the bio's lead sentence as an italic subtitle only when it adds detail beyond About.
  const bioText = String(developer.bio || '').trim();
  const leadSentence = bioText.match(/^.+?[.!?](?=\s|$)/)?.[0]?.trim();
  const subtitle = options.headline?.trim() || (leadSentence && leadSentence.length < bioText.length ? leadSentence : '');

  const website = developer.websiteUrl || developer.website || developer.blog;
  const twitter = developer.twitterUsername || developer.twitter;
  const linkedin = developer.linkedin || developer.linkedinUrl;

  const badges = compact([
    `[![GitHub](https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/${encodedLogin})`,
    website && `[![Website](https://img.shields.io/badge/Website-000000?style=for-the-badge&logo=googlechrome&logoColor=white)](${String(website).startsWith('http') ? website : `https://${website}`})`,
    linkedin && `[![LinkedIn](https://img.shields.io/badge/LinkedIn-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white)](${String(linkedin).startsWith('http') ? linkedin : `https://www.linkedin.com/in/${linkedin}`})`,
    twitter && `[![X](https://img.shields.io/badge/X-000000?style=for-the-badge&logo=x&logoColor=white)](https://twitter.com/${encodeURIComponent(String(twitter).replace(/^@/, ''))})`,
    developer.soUserId && `[![Stack Overflow](https://img.shields.io/badge/Stack%20Overflow-F58025?style=for-the-badge&logo=stackoverflow&logoColor=white)](https://stackoverflow.com/users/${encodeURIComponent(developer.soUserId)})`,
    `[![DevGlobe](https://img.shields.io/badge/DevGlobe-0A1F44?style=for-the-badge&logo=googleearth&logoColor=white)](${devglobeUrl})`,
  ]);

  const lines = [
    '<div align="center">',
    '',
    `<a href="https://github.com/${encodedLogin}">`,
    '  <picture>',
    `    <source media="(prefers-color-scheme: dark)" srcset="${siteUrl}/api/profile-card/${encodedLogin}.svg?theme=dark" />`,
    `    <img src="${siteUrl}/api/profile-card/${encodedLogin}.svg?theme=light" alt="${escapeHtml(developer.name || login)} terminal profile card" width="900" />`,
    '  </picture>',
    '</a>',
    '',
    `# Hey, I'm ${name} 👋`,
    '',
    `**${tagline}**`,
    ...(subtitle ? ['', `*${escapeMarkdown(subtitle)}*`] : []),
    '',
    badges.join('\n'),
    '',
    `<img src="https://komarev.com/ghpvc/?username=${encodedLogin}&style=flat-square&color=blue" alt="Profile views" />`,
    '',
    '</div>',
    '',
    '---',
    '',
    '## 🚀 About Me',
    '',
    about,
  ];

  const highlights = compact([
    developer.location && `- 🌍 Based in **${escapeMarkdown(developer.location)}**`,
    developer.topLanguage && `- 💻 Most-used language: **${escapeMarkdown(developer.topLanguage)}**`,
    developer.globalRank && `- 🏆 Ranked **#${number(developer.globalRank)} globally** on [DevGlobe](${devglobeUrl})`,
    developer.soReputation && Number(developer.soReputation) > 0 && `- 🏅 **${number(developer.soReputation)}** Stack Overflow reputation`,
  ]);
  if (highlights.length) lines.push('', ...highlights);

  const impact = compact([
    developer.globalRank && ['🌐', `Ranked **#${number(developer.globalRank)} globally** on DevGlobe`],
    developer.countryRank && developer.country && ['📍', `**#${number(developer.countryRank)} in ${escapeMarkdown(developer.country)}**`],
    developer.cityRank && developer.city && ['🏙️', `**#${number(developer.cityRank)} in ${escapeMarkdown(developer.city)}**`],
    number(developer.score) !== null && ['⭐', `DevGlobe score **${number(developer.score)}/100**`],
    number(developer.totalStars) !== null && ['🌟', `**${number(developer.totalStars)}** total stars`],
    number(developer.totalCommits) !== null && ['📦', `**${number(developer.totalCommits)}** commits`],
    number(developer.followers) !== null && ['👥', `**${number(developer.followers)}** followers`],
  ]);
  if (impact.length) {
    lines.push('', '## 🏆 Community Impact', '', '<div align="center">', '', '| | Highlight |', '|:---:|:---|');
    for (const [icon, text] of impact) lines.push(`| ${icon} | ${text} |`);
    lines.push('', '</div>');
  }

  lines.push(
    '',
    '## 📊 GitHub Stats',
    '',
    '<div align="center">',
    '',
    `<a href="https://github.com/${encodedLogin}">`,
    `  <img height="180em" src="https://github-readme-stats.vercel.app/api?username=${encodedLogin}&show_icons=true&theme=github_dark&hide_border=true&include_all_commits=true&count_private=true&rank_icon=github" alt="${escapeHtml(login)} GitHub stats" />`,
    `  <img height="180em" src="https://github-readme-stats.vercel.app/api/top-langs/?username=${encodedLogin}&layout=compact&theme=github_dark&hide_border=true&langs_count=8" alt="${escapeHtml(login)} top languages" />`,
    '</a>',
    '',
    '<br/>',
    '',
    `<img src="https://streak-stats.demolab.com/?user=${encodedLogin}&theme=github-dark-blue&hide_border=true" alt="GitHub streak" />`,
    '',
    '</div>',
  );

  if (developer.soUserId) {
    lines.push(
      '',
      '## 🏅 Stack Overflow',
      '',
      '<div align="center">',
      '',
      `<a href="https://stackoverflow.com/users/${encodeURIComponent(developer.soUserId)}">`,
      `  <img src="https://stackoverflow.com/users/flair/${encodeURIComponent(developer.soUserId)}.png?theme=dark" alt="Stack Overflow profile for ${escapeHtml(login)}" width="208" height="58" />`,
      '</a>',
      '',
      '</div>',
    );
  }

  const languages = (developer.languages || [])
    .map(language => typeof language === 'string' ? language : language?.name)
    .filter(Boolean)
    .slice(0, 12);
  if (languages.length) {
    lines.push(
      '',
      '## 🛠️ Tech Stack',
      '',
      '<div align="center">',
      '',
      '**Languages & Frameworks**',
      '',
      languages.map(languageBadge).join('\n'),
      '',
      '</div>',
    );
  }

  const repositories = (developer.topRepos || []).filter(repository => repository?.name).slice(0, 5);
  if (repositories.length) {
    lines.push('', '## 🔥 Featured Projects', '');
    for (const repository of repositories) {
      const repositoryUrl = repository.url || `https://github.com/${encodedLogin}/${encodeURIComponent(repository.name)}`;
      const description = repository.description ? ` — ${escapeMarkdown(repository.description)}` : '';
      const stars = Number(repository.stars) > 0 ? ` ⭐ ${number(repository.stars)}` : '';
      lines.push(`- [${escapeMarkdown(repository.name)}](${repositoryUrl})${stars}${description}`);
    }
  }

  lines.push(
    '',
    '---',
    '',
    '<div align="center">',
    '',
    '### 💡 *"Building in the open, one commit at a time."*',
    '',
    `[![DevGlobe profile](${siteUrl}/api/badge/${encodedLogin}.svg)](${devglobeUrl})`,
    '',
    `<sub>Generated with <a href="${siteUrl}">DevGlobe</a></sub>`,
    '',
    '</div>',
    '',
  );

  return lines.join('\n');
}
