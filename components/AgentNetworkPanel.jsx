'use client';

import { useEffect, useState } from 'react';

const METRICS = [
  { key: 'openDevelopers', label: 'Open developers' },
  { key: 'repositoryDevelopers', label: 'Repo signals' },
  { key: 'acceptedConnections', label: 'Connections' },
  { key: 'pendingRequests', label: 'In review' },
  { key: 'countries', label: 'Countries' },
];

const LIFECYCLE = [
  { id: 'discover', label: 'Discover', detail: 'Public expertise' },
  { id: 'request', label: 'Request', detail: 'Verified agent' },
  { id: 'review', label: 'Review', detail: 'Developer control' },
  { id: 'connect', label: 'Connect', detail: 'Public GitHub' },
];

export default function AgentNetworkPanel({ globeLayerVisible = false, onToggleGlobeLayer, onGraphChange }) {
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/agent-network', { cache: 'no-store' })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to load Agent Network');
        if (!cancelled) {
          setSnapshot(data);
          onGraphChange?.(data.graph || { nodes: [], developers: [], links: [] });
        }
      })
      .catch(loadError => { if (!cancelled) setError(loadError.message); });
    return () => { cancelled = true; };
  }, [onGraphChange]);

  if (error) return <div className="agent-network__state">{error}</div>;
  if (!snapshot) return <div className="agent-network__state">Loading Agent Network...</div>;

  const maxToolCount = Math.max(...snapshot.tools.map(tool => tool.count), 1);

  return (
    <div className="agent-network">
      <header className="agent-network__header">
        <span>PUBLIC AGENT SIGNALS</span>
        <h2>Agent Network</h2>
        <p>Public declarations and repository configuration evidence.</p>
      </header>

      <dl className="agent-network__metrics">
        {METRICS.map(metric => {
          const result = snapshot.metrics[metric.key];
          return (
            <div key={metric.key}>
              <dt>{metric.label}</dt>
              <dd title={result.suppressed ? `Hidden below privacy threshold ${snapshot.privacyThreshold}` : undefined}>
                {result.suppressed ? '—' : result.value}
              </dd>
            </div>
          );
        })}
      </dl>

      <section className="agent-network__globe-control" aria-labelledby="agent-globe-title">
        <span>
          <strong id="agent-globe-title">Agent and developer links</strong>
          <small>Plot public declarations and repository configuration evidence.</small>
        </span>
        <button
          type="button"
          role="switch"
          aria-label="Show AI tool and developer relationships on the globe"
          aria-checked={globeLayerVisible}
          className={globeLayerVisible ? 'agent-network__switch agent-network__switch--active' : 'agent-network__switch'}
          onClick={() => onToggleGlobeLayer?.(!globeLayerVisible)}
        >
          <span />
        </button>
      </section>

      <section className="agent-network__section" aria-labelledby="agent-lifecycle-title">
        <h3 id="agent-lifecycle-title">Connection lifecycle</h3>
        <ol className="agent-network__lifecycle">
          {LIFECYCLE.map((stage, index) => (
            <li key={stage.id}>
              <span>{index + 1}</span>
              <div><strong>{stage.label}</strong><small>{stage.detail}</small></div>
            </li>
          ))}
        </ol>
      </section>

      <section className="agent-network__section" aria-labelledby="agent-tools-title">
        <div className="agent-network__section-heading">
          <h3 id="agent-tools-title">AI tools</h3>
          <span>Declared + repository-detected</span>
        </div>
        {snapshot.tools.length > 0 ? (
          <div className="agent-network__tools">
            {snapshot.tools.map(tool => (
              <div className="agent-network__tool" key={tool.id}>
                <div><strong>{tool.name}</strong><span>{tool.count}</span></div>
                <i><span style={{ width: `${Math.round((tool.count / maxToolCount) * 100)}%` }} /></i>
              </div>
            ))}
          </div>
        ) : (
          <p className="agent-network__suppressed">Tool cohorts appear after {snapshot.privacyThreshold} public signals.</p>
        )}
      </section>

      <footer className="agent-network__footer">
        <p className="agent-network__privacy">Repository evidence does not imply personal usage or contact consent. Small cohorts are hidden.</p>
        <a
          href="https://github.com/sajeetharan/devglobe/blob/main/docs/mcp-server.md"
          target="_blank"
          rel="noopener noreferrer"
        >
          Connect your agent <span aria-hidden="true">↗</span>
        </a>
      </footer>
    </div>
  );
}
