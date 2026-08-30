import { AI_TOOLS } from './ai-profile.js';

export const MAX_AGENT_SIGNAL_REPOSITORIES = 8;
export const MAX_AGENT_SIGNAL_PATHS = 5;

const TOOL_NAMES = new Map(AI_TOOLS.map(tool => [tool.id, tool.name]));
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

export function detectRepositoryAgentSignals(repositories) {
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
        name: TOOL_NAMES.get(id) || 'Agent instructions',
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

export function isValidGitHubLogin(value) {
  return /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(String(value || '').trim());
}