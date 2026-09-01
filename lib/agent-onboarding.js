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
  'Find three TypeScript maintainers in Canada and explain the public evidence for each match.',
  'Find Python developers who are accepting requests from verified agents.',
  'Compare the open-source contribution signals of two relevant candidates without making a hiring recommendation.',
  'Request an introduction only after I approve the developer, project, and reason.',
];