'use client';

import React, { useState, useRef, useEffect } from 'react';
import { track } from '../lib/analytics.js';

export default function UserMenu({ user, onLogout, onClaim, onEditAiProfile, onOpenIntroductions, claimStatus }) {
  const [open, setOpen] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState('idle');
  const [digestPreference, setDigestPreference] = useState(null);
  const [digestStatus, setDigestStatus] = useState('idle');
  const [inviteStatus, setInviteStatus] = useState('');
  const menuRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get('email_verification');
    if (status === 'success') {
      setVerificationStatus('verified');
      track('email_verified');
    }
    if (status === 'invalid') setVerificationStatus('invalid');
  }, []);

  useEffect(() => {
    if (!user || claimStatus !== 'claimed') return;
    let cancelled = false;
    fetch('/api/contact/preferences')
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        if (!cancelled) setDigestPreference(result);
      })
      .catch(() => {
        if (!cancelled) setDigestPreference(null);
      });
    return () => { cancelled = true; };
  }, [user, claimStatus, verificationStatus]);

  async function requestEmailVerification() {
    setVerificationStatus('sending');
    try {
      const response = await fetch('/api/contact/verification', { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not send verification email');
      setVerificationStatus(result.alreadyVerified ? 'verified' : 'sent');
      track(result.alreadyVerified ? 'email_already_verified' : 'email_verification_requested');
    } catch {
      setVerificationStatus('error');
    }
  }

  async function updateDigestPreference(enabled) {
    setDigestStatus('saving');
    try {
      const response = await fetch('/api/contact/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productUpdatesEnabled: enabled }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setDigestPreference(result);
      setDigestStatus('saved');
    } catch {
      setDigestStatus('error');
    }
  }

  async function inviteDeveloper() {
    const url = `${window.location.origin}/?ref=${encodeURIComponent(user.login)}`;
    const text = 'Find your open-source profile, developer rank, and OSS Worth on DevGlobe.';
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Join me on DevGlobe', text, url });
        setInviteStatus('Invite shared');
        track('developer_invite_shared', { channel: 'native_share' });
      } else {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        setInviteStatus('Invite copied');
        track('developer_invite_shared', { channel: 'copy_link' });
      }
    } catch (error) {
      if (error.name !== 'AbortError') setInviteStatus('Unable to share invite');
    }
  }

  if (!user) {
    return (
      <a href="/api/auth/github" className="btn btn--signin" aria-label="Sign in with GitHub" title="Sign in with GitHub" onClick={() => track('github_auth_started', { source: 'header' })}>
        <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
        </svg>
        <span className="btn__label">Sign in with GitHub</span>
      </a>
    );
  }

  return (
    <div className="user-menu" ref={menuRef}>
      <button
        className="user-menu__trigger"
        onClick={() => setOpen(!open)}
        aria-label="User menu"
      >
        <img
          src={user.avatarUrl}
          alt={user.login}
          className="user-menu__avatar"
        />
        <svg className="user-menu__caret" viewBox="0 0 12 12" width="12" height="12" fill="currentColor">
          <path d="M6 8.5L1 3.5h10L6 8.5z" />
        </svg>
      </button>

      {open && (
        <div className="user-menu__dropdown">
          <div className="user-menu__info">
            <img src={user.avatarUrl} alt={user.login} className="user-menu__dropdown-avatar" />
            <div>
              <div className="user-menu__name">{user.name}</div>
              <div className="user-menu__login">@{user.login}</div>
            </div>
          </div>
          <div className="user-menu__divider" />
          {claimStatus === 'unclaimed' && (
            <>
              <div className="user-menu__claim-benefits">
                <strong>Make this profile yours</strong>
                <span>Verified identity card, AI collaboration controls, impact history, and weekly rankings.</span>
              </div>
              <button className="user-menu__item" onClick={() => { track('claim_clicked', { source: 'user_menu' }); onClaim(); setOpen(false); }}>
                <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
                  <path d="M16 8A8 8 0 110 8a8 8 0 0116 0zm-3.97-3.03a.75.75 0 00-1.08.022L7.477 9.417 5.384 7.323a.75.75 0 00-1.06 1.06L6.97 11.03a.75.75 0 001.079-.02l3.992-4.99a.75.75 0 00-.01-1.05z" />
                </svg>
                Claim and unlock profile
              </button>
            </>
          )}
          {claimStatus === 'claimed' && (
            <>
              <div className="user-menu__item user-menu__item--claimed">
                <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
                  <path d="M16 8A8 8 0 110 8a8 8 0 0116 0zm-3.97-3.03a.75.75 0 00-1.08.022L7.477 9.417 5.384 7.323a.75.75 0 00-1.06 1.06L6.97 11.03a.75.75 0 001.079-.02l3.992-4.99a.75.75 0 00-.01-1.05z" />
                </svg>
                Profile claimed ✓
              </div>
              <button className="user-menu__item" onClick={() => { onEditAiProfile(); setOpen(false); }}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 8V4H8" />
                  <rect width="16" height="12" x="4" y="8" rx="2" />
                  <path d="M2 14h2" />
                  <path d="M20 14h2" />
                  <path d="M9 13v2" />
                  <path d="M15 13v2" />
                </svg>
                AI collaboration settings
              </button>
              <button className="user-menu__item" onClick={() => { onOpenIntroductions(); setOpen(false); }}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15a4 4 0 01-4 4H8l-5 3V7a4 4 0 014-4h10a4 4 0 014 4z" />
                </svg>
                Agent requests
              </button>
              <button className="user-menu__item" onClick={inviteDeveloper}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M15 19a6 6 0 00-12 0" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M19 8v6M22 11h-6" />
                </svg>
                Invite a developer
              </button>
              {inviteStatus && <div className="user-menu__message" role="status">{inviteStatus}</div>}
              <button
                className="user-menu__item"
                onClick={requestEmailVerification}
                disabled={verificationStatus === 'sending' || verificationStatus === 'sent' || verificationStatus === 'verified'}
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect width="20" height="16" x="2" y="4" rx="2" />
                  <path d="m22 7-10 6L2 7" />
                </svg>
                {verificationStatus === 'sending' && 'Sending verification...'}
                {verificationStatus === 'sent' && 'Verification email sent'}
                {verificationStatus === 'verified' && 'Email verified'}
                {!['sending', 'sent', 'verified'].includes(verificationStatus) && 'Verify email'}
              </button>
              {(verificationStatus === 'error' || verificationStatus === 'invalid') && (
                <div className="user-menu__message" role="status">
                  {verificationStatus === 'invalid'
                    ? 'Verification link is invalid or expired.'
                    : 'Could not send verification email.'}
                </div>
              )}
              {digestPreference && (
                <label className="user-menu__digest">
                  <span>
                    <strong>Weekly ranking email</strong>
                    <small>
                      {digestPreference.emailVerified
                        ? 'Rank changes and DevGlobe updates'
                        : 'Verify your email to subscribe'}
                    </small>
                  </span>
                  <input
                    type="checkbox"
                    checked={digestPreference.productUpdatesEnabled}
                    disabled={!digestPreference.emailVerified || digestStatus === 'saving'}
                    onChange={event => updateDigestPreference(event.target.checked)}
                  />
                </label>
              )}
              {digestStatus === 'error' && (
                <div className="user-menu__message" role="status">Could not update weekly email preference.</div>
              )}
            </>
          )}
          {claimStatus === 'pending' && (
            <div className="user-menu__item user-menu__item--pending">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
              Profile pending review
            </div>
          )}
          {claimStatus === 'no_match' && (
            <div className="user-menu__item user-menu__item--no-match">
              No matching profile found
            </div>
          )}
          <button className="user-menu__item user-menu__item--logout" onClick={() => { onLogout(); setOpen(false); }}>
            <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
              <path d="M2 2.75C2 1.784 2.784 1 3.75 1h2.5a.75.75 0 010 1.5h-2.5a.25.25 0 00-.25.25v10.5c0 .138.112.25.25.25h2.5a.75.75 0 010 1.5h-2.5A1.75 1.75 0 012 13.25zm10.44 4.5H6.75a.75.75 0 000 1.5h5.69l-1.97 1.97a.749.749 0 101.06 1.06l3.25-3.25a.749.749 0 000-1.06l-3.25-3.25a.749.749 0 10-1.06 1.06l1.97 1.97z" />
            </svg>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
