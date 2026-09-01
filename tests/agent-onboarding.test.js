import test from 'node:test';
import assert from 'node:assert/strict';
import { AGENT_CLIENTS, AGENT_WORKFLOWS, DEVGLOBE_MCP_ENDPOINT } from '../lib/agent-onboarding.js';

test('offers a one-command VS Code and GitHub Copilot setup', () => {
  const vscode = AGENT_CLIENTS.find(client => client.id === 'vscode');

  assert.equal(vscode.name, 'VS Code + Copilot');
  assert.equal(vscode.config, `code --add-mcp '{"name":"devglobe","type":"http","url":"${DEVGLOBE_MCP_ENDPOINT}"}'`);
});

test('keeps remote client setup accurate and provides practical first prompts', () => {
  const claude = AGENT_CLIENTS.find(client => client.id === 'claude');
  const cursor = AGENT_CLIENTS.find(client => client.id === 'cursor');

  assert.equal(claude.config, DEVGLOBE_MCP_ENDPOINT);
  assert.equal(claude.setupUrl, 'https://claude.ai/customize/connectors');
  assert.match(cursor.config, /"mcpServers"/);
  assert.ok(AGENT_WORKFLOWS.length >= 3);
  assert.ok(AGENT_WORKFLOWS.every(workflow => !workflow.includes(DEVGLOBE_MCP_ENDPOINT)));
});