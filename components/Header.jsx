'use client';

import React from 'react';
import { track } from '../lib/analytics.js';
import UserMenu from './UserMenu.jsx';

const marketplaceUrl = 'https://marketplace.visualstudio.com/items?itemName=devglobedev.devglobe-developer-discovery';

function runMenuAction(event, action) {
  event.currentTarget.closest('details')?.removeAttribute('open');
  action();
}

export default function Header({ onHome, theme, onToggleTheme, user, onLogout, onClaim, onEditAiProfile, onOpenIntroductions, onOpenShortlists, onOpenContributions, onOpenSimilar, onOpenProfile, onGenerateCard, completionVersion, userMenuRequest, claimStatus, sidebarOpen, onToggleSidebar, onAddMe, onStartTour }) {
  return (
    <header className="header">
      <button type="button" className="header__brand" onClick={onHome} aria-label="Go to DevGlobe home">
        <img src="/devglobe.png" alt="" width="36" height="36" className="header__logo" />
        <h1 className="header__title">DevGlobe</h1>
      </button>
      <div className="header__actions">
        <button
          type="button"
          className="btn btn--sidebar-toggle"
          onClick={onToggleSidebar}
          aria-label={sidebarOpen ? 'Close leaderboard' : 'Open leaderboard'}
          aria-expanded={sidebarOpen}
          title={sidebarOpen ? 'Close leaderboard' : 'Open leaderboard'}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
            <line x1="3" y1="6" x2="3.01" y2="6" />
            <line x1="3" y1="12" x2="3.01" y2="12" />
            <line x1="3" y1="18" x2="3.01" y2="18" />
          </svg>
        </button>
        <button
          type="button"
          className="btn btn--theme"
          onClick={onToggleTheme}
          aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
          title={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
        >
          {theme === 'light' ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          )}
        </button>
        <details className="header-more">
          <summary className="btn header-more__trigger" aria-label="More DevGlobe links" title="More">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
              <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
            </svg>
            <span className="btn__label">More</span>
          </summary>
          <nav className="header-more__menu" aria-label="More DevGlobe links">
            <a href="/repository-match">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 3v12M18 9v12" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="6" r="3" /><path d="M9 18h3a6 6 0 006-6V9" /></svg>
              <span><strong>Repository match</strong><small>Match contributors to a repository</small></span>
            </a>
            {claimStatus !== 'claimed' && (
              <button type="button" onClick={event => runMenuAction(event, onAddMe)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="8" cy="7" r="4" /><path d="M19 8v6M22 11h-6" /></svg>
                <span><strong>Add me to the globe</strong><small>Create or claim your public profile</small></span>
              </button>
            )}
            <button type="button" onClick={event => runMenuAction(event, onStartTour)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M9.1 9a3 3 0 115.8 1c0 2-3 2-3 4M12 18h.01" /></svg>
              <span><strong>Quick tour</strong><small>Focus the developer search</small></span>
            </button>
            <a href="/space">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="2" /><path d="M5.6 18.4a9 9 0 0 1 0-12.8M18.4 5.6a9 9 0 0 1 0 12.8M8.5 15.5a5 5 0 0 1 0-7M15.5 8.5a5 5 0 0 1 0 7" /></svg>
              <span><strong>Live globe</strong><small>See who is coding right now</small></span>
            </a>
            <a href="/hacktoberfest">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18" /></svg>
              <span><strong>Hacktoberfest</strong><small>Find a contribution-ready issue</small></span>
            </a>
            <a href="https://sajeetharan.github.io/devglobe/" target="_blank" rel="noreferrer">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" /></svg>
              <span><strong>Documentation</strong><small>Learn DevGlobe workflows</small></span>
            </a>
            <a href="/agents">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect width="16" height="12" x="4" y="8" rx="2" /><path d="M12 8V4M9 4h6M2 14h2M20 14h2" /></svg>
              <span><strong>Agents & MCP</strong><small>Connect AI tools to the graph</small></span>
            </a>
            <a href={marketplaceUrl} target="_blank" rel="noopener noreferrer" onClick={() => track('vscode_extension_install_clicked', { source: 'main_header' })}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="14" rx="2" /><path d="m8 9-2 2 2 2M12 13h4M9 21h6" /></svg>
              <span><strong>VS Code extension</strong><small>Search without leaving the editor</small></span>
            </a>
            <a href="https://github.com/sajeetharan/devglobe" target="_blank" rel="noreferrer" onClick={() => track('github_repository_opened', { source: 'main_header' })}>
              <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25z" /></svg>
              <span><strong>GitHub</strong><small>Star or contribute to DevGlobe</small></span>
            </a>
            <a href="https://github.com/sponsors/sajeetharan" target="_blank" rel="noreferrer">
              <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="m8 14.25.345.666a.75.75 0 0 1-.69 0l-.008-.004-.018-.01a7.152 7.152 0 0 1-.31-.17 22.055 22.055 0 0 1-3.434-2.414C2.045 10.731 0 8.35 0 5.5 0 2.836 2.086 1 4.25 1 5.797 1 7.153 1.802 8 3.02 8.847 1.802 10.203 1 11.75 1 13.914 1 16 2.836 16 5.5c0 2.85-2.045 5.231-3.885 6.818a22.066 22.066 0 0 1-3.744 2.584l-.018.01-.006.003h-.002z" /></svg>
              <span><strong>Sponsor</strong><small>Support the open-source project</small></span>
            </a>
          </nav>
        </details>
        <UserMenu user={user} onLogout={onLogout} onClaim={onClaim} onEditAiProfile={onEditAiProfile} onOpenIntroductions={onOpenIntroductions} onOpenShortlists={onOpenShortlists} onOpenContributions={onOpenContributions} onOpenSimilar={onOpenSimilar} onOpenProfile={onOpenProfile} onGenerateCard={onGenerateCard} completionVersion={completionVersion} openRequest={userMenuRequest} claimStatus={claimStatus} />
      </div>
    </header>
  );
}