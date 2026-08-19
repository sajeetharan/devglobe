'use client';

import Link from 'next/link';
import { track } from '../lib/analytics.js';
import { useEffect, useState } from 'react';
import styles from './AgentSetupPage.module.css';

const endpoint = 'https://www.devglobe.dev/mcp';
const marketplaceUrl = 'https://marketplace.visualstudio.com/items?itemName=devglobedev.devglobe-developer-discovery';
const clients = [
  {
    id: 'vscode',
    name: 'VS Code',
    file: '.vscode/mcp.json',
    config: `{
  "servers": {
    "devglobe": {
      "type": "http",
      "url": "${endpoint}"
    }
  }
}`,
  },
  {
    id: 'claude',
    name: 'Claude',
    file: 'MCP connector',
    config: `{
  "name": "devglobe",
  "type": "http",
  "url": "${endpoint}"
}`,
  },
  {
    id: 'cursor',
    name: 'Cursor',
    file: '.cursor/mcp.json',
    config: `{
  "mcpServers": {
    "devglobe": {
      "type": "http",
      "url": "${endpoint}"
    }
  }
}`,
  },
  {
    id: 'http',
    name: 'HTTP',
    file: 'Streamable HTTP',
    config: endpoint,
  },
];

const workflows = [
  'Find three TypeScript maintainers in Canada and explain the public evidence for each match.',
  'Find Python developers who are accepting requests from verified agents.',
  'Compare the open-source contribution signals of two relevant candidates without making a hiring recommendation.',
  'Request an introduction only after I approve the developer, project, and reason.',
];

export default function AgentSetupPage() {
  const [selectedId, setSelectedId] = useState('vscode');
  const [copied, setCopied] = useState('');
  const selected = clients.find(client => client.id === selectedId) || clients[0];

  useEffect(() => {
    track('agent_setup_viewed');
  }, []);

  async function copy(value, type) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(type);
      track('agent_config_copied', { client: type });
      window.setTimeout(() => setCopied(''), 1800);
    } catch {
      setCopied('error');
    }
  }

  return (
    <main className={styles.page}>
      <nav className={styles.nav} aria-label="Agent setup navigation">
        <Link href="/" className={styles.brand}>
          <img src="/devglobe.png" alt="" />
          <span>DevGlobe</span>
        </Link>
        <div className={styles.navLinks}>
          <a href="https://sajeetharan.github.io/devglobe/agents/mcp" target="_blank" rel="noreferrer">Documentation</a>
          <a href="https://github.com/sajeetharan/devglobe" target="_blank" rel="noreferrer">GitHub</a>
        </div>
      </nav>

      <header className={styles.hero}>
        <span className={styles.eyebrow}>MCP DEVELOPER DISCOVERY</span>
        <h1>Give your agent a map of open-source expertise.</h1>
        <p>Connect once, then search 26,000+ public developer profiles by skill, language, location, and agent availability.</p>
        <div className={styles.heroActions}>
          <a
            href={marketplaceUrl}
            target="_blank"
            rel="noreferrer"
            onClick={() => track('vscode_extension_install_clicked', { source: 'agent_setup' })}
          >
            Install for VS Code
          </a>
          <span>Search profiles and copy MCP setup directly from the Command Palette.</span>
        </div>
        <div className={styles.endpoint}>
          <span>Streamable HTTP</span>
          <code>{endpoint}</code>
          <button type="button" onClick={() => copy(endpoint, 'endpoint')}>{copied === 'endpoint' ? 'Copied' : 'Copy endpoint'}</button>
        </div>
      </header>

      <section className={styles.setup} aria-labelledby="agent-setup-title">
        <div className={styles.sectionHeading}>
          <span>01</span>
          <div>
            <h2 id="agent-setup-title">Choose your client</h2>
            <p>Public search works without credentials.</p>
          </div>
        </div>
        <div className={styles.clientPicker} role="tablist" aria-label="MCP clients">
          {clients.map(client => (
            <button
              type="button"
              role="tab"
              aria-selected={selected.id === client.id}
              className={selected.id === client.id ? styles.activeClient : ''}
              onClick={() => setSelectedId(client.id)}
              key={client.id}
            >
              {client.name}
            </button>
          ))}
        </div>
        <div className={styles.configPanel}>
          <div className={styles.configMeta}>
            <span>{selected.file}</span>
            <button type="button" onClick={() => copy(selected.config, selected.id)}>
              {copied === selected.id ? 'Copied' : 'Copy configuration'}
            </button>
          </div>
          <pre><code>{selected.config}</code></pre>
        </div>
        {copied === 'error' && <p className={styles.copyError} role="status">Clipboard access was unavailable.</p>}
      </section>

      <section className={styles.workflowSection} aria-labelledby="agent-workflows-title">
        <div className={styles.sectionHeading}>
          <span>02</span>
          <div>
            <h2 id="agent-workflows-title">Put it to work</h2>
            <p>Prompts designed around DevGlobe&apos;s consent and evidence boundaries.</p>
          </div>
        </div>
        <div className={styles.workflows}>
          {workflows.map((workflow, index) => (
            <article key={workflow}>
              <span>0{index + 1}</span>
              <p>{workflow}</p>
              <button type="button" onClick={() => copy(workflow, `workflow_${index + 1}`)}>
                {copied === `workflow_${index + 1}` ? 'Copied' : 'Copy prompt'}
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.boundary} aria-labelledby="agent-boundary-title">
        <div>
          <span className={styles.eyebrow}>TRUST BOUNDARY</span>
          <h2 id="agent-boundary-title">Discovery is public. Contact stays consensual.</h2>
        </div>
        <dl>
          <div><dt>Search and profiles</dt><dd>Anonymous access to public contribution data.</dd></div>
          <div><dt>Introductions</dt><dd>Issued agent credential, developer opt-in, and approval required.</dd></div>
          <div><dt>Private data</dt><dd>Email addresses and private collaboration settings are never returned.</dd></div>
        </dl>
      </section>

      <footer className={styles.resources}>
        <span>Machine-readable resources</span>
        <a href="/.well-known/mcp/server-card.json">MCP server card</a>
        <a href="/.well-known/agent-skills/index.json">Agent Skill</a>
        <a href="/llms.txt">llms.txt</a>
        <a href="/openapi.json">OpenAPI</a>
        <a href="/auth.md">Authentication</a>
      </footer>
    </main>
  );
}