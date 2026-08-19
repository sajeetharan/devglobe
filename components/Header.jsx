'use client';

import React from 'react';
import { track } from '../lib/analytics.js';
import UserMenu from './UserMenu.jsx';

const marketplaceUrl = 'https://marketplace.visualstudio.com/items?itemName=devglobedev.devglobe-developer-discovery';

export default function Header({ onHome, theme, onToggleTheme, user, onLogout, onClaim, onEditAiProfile, onOpenIntroductions, claimStatus, sidebarOpen, onToggleSidebar, activityOpen, onOpenActivity, onAddMe, onStartTour }) {
  return (
    <header className="header">
      <div className="header__brand" onClick={onHome} style={{ cursor: 'pointer' }}>
        <img src="/devglobe.png" alt="DevGlobe" className="header__logo" />
        <h1 className="header__title">DevGlobe</h1>
        <span className="header__subtitle">Where Developers and AI Agents Connect</span>
      </div>
      <div className="header__actions">
        <button type="button" onClick={onStartTour} className="btn btn--tour" aria-label="Start quick tour" title="Quick tour">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.1 9a3 3 0 115.8 1c0 2-3 2-3 4" />
            <path d="M12 18h.01" />
          </svg>
        </button>
        <button type="button" onClick={onAddMe} className="btn btn--join" aria-label="Add me to the globe" title="Add me to the globe">
          <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true" focusable="false">
            <path d="M6 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm2-3a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm-2 5c-2.97 0-6 1.49-6 3v1h12v-1c0-1.51-3.03-3-6-3zm-4.9 3c.4-1 2.2-2 4.9-2s4.5 1 4.9 2H1.1zM12.5 4h-1a.5.5 0 0 0 0 1h1v1a.5.5 0 0 0 1 0V5h1a.5.5 0 0 0 0-1h-1V3a.5.5 0 0 0-1 0v1z"></path>
          </svg><span className="btn__label">Add Me To Globe</span>
        </button>
        <button
          type="button"
          className={`btn btn--activity${activityOpen ? ' btn--active' : ''}`}
          onClick={onOpenActivity}
          aria-label={activityOpen ? 'Close live activity' : 'Open live activity'}
          aria-expanded={activityOpen}
          title="Live developer activity"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 12h4l2-7 4 14 2-7h6" />
          </svg>
          <span className="btn__label">Activity</span>
        </button>
        <button
          type="button"
          className="btn btn--sidebar-toggle"
          onClick={onToggleSidebar}
          aria-label={sidebarOpen ? 'Close leaderboard' : 'Open leaderboard'}
          aria-expanded={sidebarOpen}
          title={sidebarOpen ? 'Close leaderboard' : 'Open leaderboard'}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
        <a href="https://sajeetharan.github.io/devglobe/" target="_blank" rel="noreferrer" className="btn btn--docs" aria-label="Open DevGlobe documentation" title="Documentation">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
          </svg>
          <span className="btn__label">Docs</span>
        </a>
        <a href="/agents" className="btn btn--docs" aria-label="Connect an AI agent" title="Connect an AI agent">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect width="16" height="12" x="4" y="8" rx="2" />
            <path d="M12 8V4M9 4h6M2 14h2M20 14h2M9 13v2M15 13v2" />
          </svg>
          <span className="btn__label">Agents</span>
        </a>
        <a
          href={marketplaceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn--extension"
          aria-label="Install DevGlobe for VS Code"
          title="Install DevGlobe for VS Code"
          onClick={() => track('vscode_extension_install_clicked', { source: 'main_header' })}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="4" width="18" height="14" rx="2" />
            <path d="m8 9-2 2 2 2M12 13h4M9 21h6" />
          </svg>
          <span className="btn__label">VS Code</span>
        </a>
        <a href="https://github.com/sajeetharan/devglobe" target="_blank" rel="noreferrer" className="btn btn--star" aria-label="Star DevGlobe on GitHub" title="Star DevGlobe on GitHub">
          <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
            <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25z" />
          </svg>
          <span className="btn__label">Star on GitHub</span>
        </a>
        <a href="https://github.com/sponsors/sajeetharan" target="_blank" rel="noreferrer" className="btn btn--sponsor" aria-label="Sponsor DevGlobe on GitHub" title="Sponsor DevGlobe on GitHub">
          <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
            <path d="m8 14.25.345.666a.75.75 0 0 1-.69 0l-.008-.004-.018-.01a7.152 7.152 0 0 1-.31-.17 22.055 22.055 0 0 1-3.434-2.414C2.045 10.731 0 8.35 0 5.5 0 2.836 2.086 1 4.25 1 5.797 1 7.153 1.802 8 3.02 8.847 1.802 10.203 1 11.75 1 13.914 1 16 2.836 16 5.5c0 2.85-2.045 5.231-3.885 6.818a22.066 22.066 0 0 1-3.744 2.584l-.018.01-.006.003h-.002z" />
          </svg>
          <span className="btn__label">Sponsor</span>
        </a>
        <UserMenu user={user} onLogout={onLogout} onClaim={onClaim} onEditAiProfile={onEditAiProfile} onOpenIntroductions={onOpenIntroductions} claimStatus={claimStatus} />
      </div>
    </header>
  );
}