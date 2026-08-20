'use client';

import { useEffect, useState } from 'react';
import { track } from '../lib/analytics.js';
import { defaultReadmeAbout, generateProfileReadme } from '../lib/profile-readme.js';

const MODES = ['edit', 'source'];

export default function ReadmeGeneratorModal({ developer, onClose }) {
  const [about, setAbout] = useState(() => defaultReadmeAbout(developer));
  const [mode, setMode] = useState('edit');
  const [status, setStatus] = useState('');
  const siteUrl = typeof window === 'undefined' ? 'https://www.devglobe.dev' : window.location.origin;
  const markdown = generateProfileReadme(developer, { about, siteUrl });

  useEffect(() => {
    const handleKeyDown = event => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  async function copyMarkdown() {
    try {
      await navigator.clipboard.writeText(markdown);
      setStatus('Copied README');
      track('profile_readme_copied', { login: developer.login });
    } catch {
      setStatus('Copy failed. Select the source and copy it manually.');
    }
  }

  function downloadMarkdown() {
    const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'README.md';
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus('Downloaded README.md');
    track('profile_readme_downloaded', { login: developer.login });
  }

  function handleTabKeyDown(event) {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    const nextMode = MODES[(MODES.indexOf(mode) + direction + MODES.length) % MODES.length];
    setMode(nextMode);
    document.getElementById(`readme-tab-${nextMode}`)?.focus();
  }

  return (
    <div className="readme-modal__backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section className="readme-modal" role="dialog" aria-modal="true" aria-labelledby="readme-modal-title">
        <button type="button" className="readme-modal__close" onClick={onClose} aria-label="Close README generator">&times;</button>
        <header className="readme-modal__header">
          <span>GITHUB PROFILE</span>
          <h2 id="readme-modal-title">Generate README.md</h2>
          <p>Customize the introduction, then add the generated file to your GitHub profile repository.</p>
        </header>

        <div className="readme-modal__tabs" role="tablist" aria-label="README generator view">
          <button type="button" id="readme-tab-edit" role="tab" aria-selected={mode === 'edit'} aria-controls="readme-panel-edit" tabIndex={mode === 'edit' ? 0 : -1} onClick={() => setMode('edit')} onKeyDown={handleTabKeyDown}>Edit profile</button>
          <button type="button" id="readme-tab-source" role="tab" aria-selected={mode === 'source'} aria-controls="readme-panel-source" tabIndex={mode === 'source' ? 0 : -1} onClick={() => setMode('source')} onKeyDown={handleTabKeyDown}>Markdown source</button>
        </div>

        {mode === 'edit' ? (
          <div className="readme-modal__panel" id="readme-panel-edit" role="tabpanel" aria-labelledby="readme-tab-edit">
            <label className="readme-modal__field">
              <span>About me</span>
              <textarea value={about} onChange={event => setAbout(event.target.value)} rows={8} maxLength={1200} />
              <small>Markdown is supported. Profile metrics, languages, repositories, and links are filled from DevGlobe.</small>
            </label>
          </div>
        ) : (
          <div className="readme-modal__panel" id="readme-panel-source" role="tabpanel" aria-labelledby="readme-tab-source">
            <pre className="readme-modal__source" tabIndex="0"><code>{markdown}</code></pre>
          </div>
        )}

        <footer className="readme-modal__footer">
          <span className="readme-modal__status" role="status" aria-live="polite">{status}</span>
          <button type="button" className="readme-modal__action readme-modal__action--secondary" onClick={copyMarkdown}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M15 9V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h4" /></svg>
            Copy
          </button>
          <button type="button" className="readme-modal__action" onClick={downloadMarkdown}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4" /><path d="M5 21h14" /></svg>
            Download README.md
          </button>
        </footer>
      </section>
    </div>
  );
}
