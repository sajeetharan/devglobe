'use client';

import Link from 'next/link';
import { CheckCircle2, ChevronRight, Clock3, Download, ExternalLink, Search, X } from 'lucide-react';
import { useState } from 'react';
import { track } from '../lib/analytics.js';
import { attributedInstallUrl, filterEditorChannels } from '../lib/editor-distribution.js';
import EditorBrandIcon from './EditorBrandIcon.jsx';
import styles from '../app/plugins/plugins.module.css';

const filters = [
  { value: 'all', label: 'All' },
  { value: 'available', label: 'Available now' },
  { value: 'planned', label: 'Coming next' },
];

export default function EditorPicker({ editors }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const results = filterEditorChannels(editors, { query, status });

  function trackInstall(editor) {
    track('extension_install_clicked', { source: 'plugin_directory', action: editor.slug });
  }

  return (
    <section className={styles.picker} aria-labelledby="editor-picker-title">
      <div className={styles.pickerHeading}>
        <div>
          <h2 id="editor-picker-title">Find your editor</h2>
          <span>{results.length} {results.length === 1 ? 'connection' : 'connections'}</span>
        </div>
        <div className={styles.searchField}>
          <Search size={18} aria-hidden="true" />
          <label htmlFor="editor-search">Search editors</label>
          <input
            id="editor-search"
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search VS Code, Cursor, JetBrains..."
            autoComplete="off"
          />
          {query ? <button type="button" onClick={() => setQuery('')} aria-label="Clear editor search"><X size={17} aria-hidden="true" /></button> : null}
        </div>
      </div>

      <div className={styles.filters} aria-label="Filter editor connections">
        {filters.map(filter => (
          <button key={filter.value} type="button" aria-pressed={status === filter.value} onClick={() => setStatus(filter.value)}>
            {filter.label}
          </button>
        ))}
      </div>

      {results.length ? (
        <div className={styles.editorGrid} aria-live="polite">
          {results.map(editor => {
            const available = editor.status === 'available';
            const installUrl = attributedInstallUrl(editor);
            return (
              <article className={styles.editorCard} key={editor.slug} style={{ '--editor-accent': editor.accent }}>
                <div className={styles.editorIdentity}>
                  <span className={styles.editorIcon}><EditorBrandIcon editor={editor} /></span>
                  <div>
                    <h3>{editor.name}</h3>
                    <span>{editor.family} connection</span>
                  </div>
                </div>
                <div className={styles.availability} data-status={editor.status}>
                  {available ? <CheckCircle2 size={15} aria-hidden="true" /> : <Clock3 size={15} aria-hidden="true" />}
                  {available ? (editor.slug === 'vscode' ? 'Marketplace' : 'VSIX ready') : 'In development'}
                </div>
                <p>{available ? `Show up on the live globe directly from ${editor.name}.` : `A native ${editor.family} client is on the roadmap.`}</p>
                <div className={styles.cardActions}>
                  {available ? (
                    <a className={styles.installAction} href={installUrl} target="_blank" rel="noreferrer" onClick={() => trackInstall(editor)}>
                      {editor.slug === 'vscode' ? <ExternalLink size={17} aria-hidden="true" /> : <Download size={17} aria-hidden="true" />}
                      {editor.slug === 'vscode' ? 'Install' : 'Download'}
                    </a>
                  ) : null}
                  <Link className={available ? styles.setupAction : styles.roadmapAction} href={`/plugins/${editor.slug}`}>
                    {available ? 'Setup guide' : 'View roadmap'}<ChevronRight size={16} aria-hidden="true" />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className={styles.noResults} role="status">
          <Search size={24} aria-hidden="true" />
          <strong>No editor found</strong>
          <p>Try another name or view all connections.</p>
          <button type="button" onClick={() => { setQuery(''); setStatus('all'); }}>Show all editors</button>
        </div>
      )}
    </section>
  );
}