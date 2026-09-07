export const DEVGLOBE_MCP_ENDPOINT = 'https://www.devglobe.dev/mcp';

export const AGENT_CLIENTS = [
  {
    id: 'vscode',
    name: 'VS Code + Copilot',
    file: 'Terminal command',
    setupLabel: 'Copy install command',
    setupHint: 'Run once, review the server, then approve it in VS Code.',
    config: `code --add-mcp '{"name":"devglobe","type":"http","url":"${DEVGLOBE_MCP_ENDPOINT}"}'`,
  },
  {
    id: 'claude',
    name: 'Claude',
    file: 'Remote MCP server URL',
    setupUrl: 'https://claude.ai/customize/connectors',
    setupLabel: 'Copy URL and open Claude',
    setupHint: 'Choose Add custom connector, then paste the copied URL.',
    config: DEVGLOBE_MCP_ENDPOINT,
  },
  {
    id: 'cursor',
    name: 'Cursor',
    file: '.cursor/mcp.json',
    setupUrl: 'https://cursor.com/docs/context/mcp',
    setupLabel: 'Copy config and open guide',
    setupHint: 'Save the copied JSON in your project or global MCP configuration.',
    config: `{
  "mcpServers": {
    "devglobe": {
      "url": "${DEVGLOBE_MCP_ENDPOINT}"
    }
  }
}`,
  },
  {
    id: 'http',
    name: 'HTTP',
    file: 'Streamable HTTP',
    config: DEVGLOBE_MCP_ENDPOINT,
  },
];

export const AGENT_WORKFLOWS = [
  {
    id: 'weekly-developer-scout',
    title: 'Weekly developer scout',
    cadence: 'Weekly',
    outcome: 'A reviewed shortlist grounded in public evidence',
    prompt: 'Find three TypeScript maintainers in Canada and explain the public evidence for each match. Include canonical DevGlobe profile links and suggest how I should refine this search next week.',
  },
  {
    id: 'repository-contributor-match',
    title: 'Repository contributor match',
    cadence: 'Per repository',
    outcome: 'Relevant contributors with transparent match reasons',
    prompt: 'Match developers to my public GitHub repository. Explain the public evidence for each match, include canonical DevGlobe profile links, and do not infer availability.',
  },
  {
    id: 'contribution-opportunity-finder',
    title: 'Contribution opportunity finder',
    cadence: 'Weekly',
    outcome: 'One contribution-ready public issue to review',
    prompt: 'Find a contribution-ready public issue for a relevant DevGlobe developer. Explain why it matches, link the developer profile and issue, and do not claim or reserve the issue.',
  },
  {
    id: 'consent-gated-introduction',
    title: 'Consent-gated introduction',
    cadence: 'When needed',
    outcome: 'An introduction request only after explicit approval',
    prompt: 'Find developers accepting verified agent requests. Show public match evidence and canonical DevGlobe profile links, then request an introduction only after I approve the developer, project, and reason.',
  },
];