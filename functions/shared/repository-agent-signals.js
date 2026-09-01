const MAX_AGENT_SIGNAL_REPOSITORIES = 8;
const MAX_AGENT_SIGNAL_PATHS = 5;
const GITHUB_API = 'https://api.github.com';

const TOOL_NAMES = new Map([
  ['github-copilot', 'GitHub Copilot'],
  ['claude-code', 'Claude Code'],
  ['cursor', 'Cursor'],
  ['openai-codex', 'OpenAI Codex'],
  ['gemini-cli', 'Gemini CLI'],
  ['windsurf', 'Windsurf'],
  ['custom-agent', 'Custom agent'],
]);

const SIGNAL_RULES = [
  { id: 'github-copilot', matches: path => path === '.github/copilot-instructions.md' || /^\.github\/instructions\/.+\.instructions\.md$/.test(path) || /^\.github\/agents\/.+\.agent\.md$/.test(path) },
  { id: 'claude-code', matches: path => path === 'claude.md' || path.startsWith('.claude/') },
  { id: 'cursor', matches: path => path === '.cursorrules' || path.startsWith('.cursor/rules/') },
  { id: 'openai-codex', matches: path => path === '.codex/config.toml' },
  { id: 'gemini-cli', matches: path => path === 'gemini.md' || path.startsWith('.gemini/') },
  { id: 'windsurf', matches: path => path === '.windsurfrules' || path.startsWith('.windsurf/rules/') },
  { id: 'custom-agent', matches: path => path === 'agents.md' || path.endsWith('/agents.md') },
];

function normalizePath(value) {
  return String(value || '').trim().replaceAll('\\', '/').replace(/^\.\//, '').toLowerCase();
}

function detectRepositoryAgentSignals(repositories) {
  const signals = new Map();

  for (const repository of repositories.slice(0, MAX_AGENT_SIGNAL_REPOSITORIES)) {
    const repositoryName = String(repository?.fullName || '').trim();
    if (!repositoryName || !Array.isArray(repository.paths)) continue;
    const matchesByTool = new Map();

    for (const rawPath of repository.paths) {
      const path = normalizePath(rawPath);
      if (!path) continue;
      for (const rule of SIGNAL_RULES) {
        if (!rule.matches(path)) continue;
        const paths = matchesByTool.get(rule.id) || [];
        if (paths.length < MAX_AGENT_SIGNAL_PATHS && !paths.includes(path)) paths.push(path);
        matchesByTool.set(rule.id, paths);
      }
    }

    for (const [id, paths] of matchesByTool) {
      const signal = signals.get(id) || {
        id,
        name: TOOL_NAMES.get(id),
        source: 'public-repository',
        repositories: [],
      };
      signal.repositories.push({
        name: repositoryName,
        url: `https://github.com/${repositoryName}`,
        paths,
      });
      signals.set(id, signal);
    }
  }

  return [...signals.values()].sort((first, second) =>
    second.repositories.length - first.repositories.length || first.name.localeCompare(second.name));
}

function githubHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'User-Agent': 'devglobe-agent-signal-ingest',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

async function scanDeveloperRepositorySignals(fetchImpl, login, token) {
  const response = await fetchImpl(`${GITHUB_API}/users/${encodeURIComponent(login)}/repos?type=owner&sort=updated&direction=desc&per_page=30`, {
    headers: githubHeaders(token),
  });
  if (response.status === 404) return { scannedRepositories: 0, signals: [] };
  if (!response.ok) {
    const error = new Error(`GitHub repository lookup returned ${response.status}`);
    error.status = response.status;
    error.rateLimitRemaining = Number(response.headers.get('x-ratelimit-remaining'));
    throw error;
  }

  const payload = await response.json();
  const repositories = (Array.isArray(payload) ? payload : [])
    .filter(repository => !repository.private && !repository.fork && !repository.archived && repository.default_branch)
    .slice(0, MAX_AGENT_SIGNAL_REPOSITORIES);
  const scanned = [];
  for (const repository of repositories) {
    const treeResponse = await fetchImpl(`${GITHUB_API}/repos/${repository.full_name}/git/trees/${encodeURIComponent(repository.default_branch)}?recursive=1`, {
      headers: githubHeaders(token),
    });
    if (!treeResponse.ok) {
      const error = new Error(`GitHub repository tree lookup returned ${treeResponse.status}`);
      error.status = treeResponse.status;
      error.rateLimitRemaining = Number(treeResponse.headers.get('x-ratelimit-remaining'));
      throw error;
    }
    const tree = await treeResponse.json();
    scanned.push({
      fullName: repository.full_name,
      paths: Array.isArray(tree.tree)
        ? tree.tree.filter(entry => entry.type === 'blob').map(entry => entry.path)
        : [],
    });
  }

  return {
    scannedRepositories: scanned.length,
    signals: detectRepositoryAgentSignals(scanned),
  };
}

module.exports = {
  MAX_AGENT_SIGNAL_PATHS,
  MAX_AGENT_SIGNAL_REPOSITORIES,
  detectRepositoryAgentSignals,
  scanDeveloperRepositorySignals,
};
