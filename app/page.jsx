'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { track } from '../lib/analytics.js';
import Header from '../components/Header.jsx';
import SearchBar from '../components/SearchBar.jsx';
import Leaderboard from '../components/Leaderboard.jsx';
import DetailPanel from '../components/DetailPanel.jsx';
import ComparePanel from '../components/ComparePanel.jsx';
import LoadingOverlay from '../components/LoadingOverlay.jsx';
import AddMeModal from '../components/AddMeModal.jsx';
import ClaimStatusModal from '../components/ClaimStatusModal.jsx';
import AiProfileModal from '../components/AiProfileModal.jsx';
import IntroductionInboxModal from '../components/IntroductionInboxModal.jsx';
import ShortlistManagerModal from '../components/ShortlistManagerModal.jsx';
import ContributionOpportunitiesModal from '../components/ContributionOpportunitiesModal.jsx';
import SimilarDevelopersModal from '../components/SimilarDevelopersModal.jsx';
import QuickTour from '../components/QuickTour.jsx';
import PlatformActivityBanner from '../components/PlatformActivityBanner.jsx';
import { prepareDeveloperDataset } from '../lib/developer-dataset.js';
import { developerSnapshotUrl, publicApiUrl } from '../lib/public-api.js';
import { resolveIdentityCardDeveloper } from '../lib/home-actions.js';
import dynamic from 'next/dynamic';

const Globe = dynamic(() => import('../components/Globe.jsx'), { ssr: false });
const PENDING_CLAIM_KEY = 'devglobe-pending-claim';
// See #182: fetch a small, fast initial batch for quick Time-to-Interactive,
// then progressively fetch the rest in the background instead of one huge payload.
const INITIAL_BATCH_SIZE = 500;
const BACKGROUND_BATCH_SIZE = 1000;
const BACKGROUND_UI_FLUSH_SIZE = 5000;
const PENDING_README_KEY = 'devglobe-pending-readme';
const PENDING_HOME_README_KEY = 'devglobe-pending-home-readme';
let cachedDeveloperDataset = null;

export default function Home() {
  const [developers, setDevelopers] = useState(() => cachedDeveloperDataset?.developers || []);
  const [datasetCount, setDatasetCount] = useState(null);
  const [filtered, setFiltered] = useState(() => cachedDeveloperDataset?.developers || []);
  const [datasetLoading, setDatasetLoading] = useState(false);
  const [searchActive, setSearchActive] = useState(false);
  const [selectedDev, setSelectedDev] = useState(null);
  const [loading, setLoading] = useState(() => !cachedDeveloperDataset);
  const [loadingStage, setLoadingStage] = useState('connecting');
  const [error, setError] = useState(null);
  const [flyTarget, setFlyTarget] = useState(null);
  const [selectedCountry, setSelectedCountry] = useState('');
  const [compareDevs, setCompareDevs] = useState([]);
  const [theme, setTheme] = useState('dark');
  const [user, setUser] = useState(null);
  const [claimStatus, setClaimStatus] = useState('checking'); // 'checking' | 'unclaimed' | 'pending' | 'claimed' | 'no_match'
  const [claimedLogins, setClaimedLogins] = useState(() => new Set(cachedDeveloperDataset?.claimedLogins || []));
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarView, setSidebarView] = useState('leaderboard');
  const [cardRequest, setCardRequest] = useState(0);
  const [readmeRequest, setReadmeRequest] = useState(0);
  const [cardContext, setCardContext] = useState(null);
  const [showAddMe, setShowAddMe] = useState(false);
  const [addMeUsername, setAddMeUsername] = useState('');
  const [verificationUsername, setVerificationUsername] = useState('');
  const [showClaimPending, setShowClaimPending] = useState(false);
  const [showAiProfile, setShowAiProfile] = useState(false);
  const [showIntroductions, setShowIntroductions] = useState(false);
  const [shortlistLogin, setShortlistLogin] = useState('');
  const [showShortlists, setShowShortlists] = useState(false);
  const [showContributions, setShowContributions] = useState(false);
  const [similarLogin, setSimilarLogin] = useState('');
  const [completionVersion, setCompletionVersion] = useState(0);
  const [agentGlobeLayerVisible, setAgentGlobeLayerVisible] = useState(false);
  const [trending, setTrending] = useState(null);
  const [trendingError, setTrendingError] = useState('');
  const [tourStep, setTourStep] = useState(null);
  const [tourMatch, setTourMatch] = useState(null);
  const globeRef = useRef(null);

  useEffect(() => {
    // Mirrors the blocking script in layout.jsx so React state matches the
    // theme already applied to <html> before hydration.
    try {
      const stored = localStorage.getItem('devglobe-theme');
      if (stored === 'light' || stored === 'dark') {
        setTheme(stored);
      } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
        setTheme('light');
      }
    } catch (err) {
      // localStorage unavailable (e.g. private browsing) — fall back to dark
    }
  }, []);

  useEffect(() => {
    const referrer = new URLSearchParams(window.location.search).get('ref')?.trim();
    if (!referrer || !/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(referrer)) return;
    const key = `devglobe-referral-${referrer.toLowerCase()}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch { /* Analytics can still record the visit without session storage. */ }
    track('referral_landing', { referrer: referrer.toLowerCase() });
  }, []);

  useEffect(() => {
    function syncSimilarLogin() {
      const login = new URLSearchParams(window.location.search).get('similar')?.trim();
      setSimilarLogin(/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(login || '') ? login : '');
    }
    syncSimilarLogin();
    window.addEventListener('popstate', syncSimilarLogin);
    return () => window.removeEventListener('popstate', syncSimilarLogin);
  }, []);

  useEffect(() => {
    const username = new URLSearchParams(window.location.search).get('add')?.trim().replace(/^@/, '');
    if (!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(username || '')) return;
    setAddMeUsername(username);
    setShowAddMe(true);
  }, []);

  // Fetch session on mount
  useEffect(() => {
    async function loadSession() {
      try {
        const res = await fetch('/api/auth/session', { cache: 'no-store', credentials: 'same-origin' });
        const data = await res.json();
        if (data.user) {
          setUser(data.user);
          const url = new URL(window.location.href);
          if (url.searchParams.get('auth') === 'success') {
            let source = 'signin';
            try {
              if (localStorage.getItem(PENDING_CLAIM_KEY)) source = 'claim';
            } catch { /* localStorage is optional for attribution. */ }
            track('github_auth_completed', { source });
            url.searchParams.delete('auth');
            window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
          }
        }
      } catch { /* not authenticated */ }
    }
    loadSession();
  }, []);

  // Resolve ownership independently of the incrementally loaded leaderboard.
  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    setClaimStatus('checking');

    fetch(`/api/developer?id=${encodeURIComponent(user.login)}`, { cache: 'no-store' })
      .then(async response => {
        if (response.status === 404) return null;
        if (!response.ok) throw new Error('Unable to check profile ownership');
        return response.json();
      })
      .then(profile => {
        if (cancelled) return;
        const isOwner = profile?.claimed === true
          && profile.login?.toLowerCase() === user.login.toLowerCase();
        setClaimStatus(isOwner ? 'claimed' : 'unclaimed');
        if (isOwner) setClaimedLogins(previous => new Set(previous).add(user.login));
      })
      .catch(() => {
        if (!cancelled) setClaimStatus(current => current === 'claimed' ? current : 'unclaimed');
      });

    return () => { cancelled = true; };
  }, [user]);

  // A claimed record in any loaded batch can promote the status, but an
  // incomplete batch must never demote an authoritative ownership result.
  useEffect(() => {
    if (!user || developers.length === 0) return;
    const match = developers.find(developer => developer.login?.toLowerCase() === user.login.toLowerCase());
    if (match?.claimed) {
      setClaimStatus('claimed');
      setClaimedLogins(prev => new Set(prev).add(user.login));
    }
  }, [user, developers]);

  const handleLogout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setClaimStatus('unclaimed');
    setShowAiProfile(false);
    setShowIntroductions(false);
  }, []);

  const handleAiProfileSaved = useCallback((aiProfile) => {
    setSelectedDev(current => current?.login === user?.login ? { ...current, aiProfile } : current);
    setCompletionVersion(version => version + 1);
  }, [user]);

  const handleClaim = useCallback(async ({ openCard = true, openReadme = false } = {}) => {
    track('claim_started');
    try {
      const res = await fetch('/api/auth/claim', { method: 'POST' });
      if (res.ok) {
        const result = await res.json();
        if (result.profileStatus !== 'public') {
          setClaimStatus('pending');
          setSelectedDev(null);
          setCardContext(null);
          setCardRequest(0);
          setShowClaimPending(true);
          setSidebarOpen(false);
          return { ok: false, ...result };
        }
        setClaimStatus('claimed');
        const source = new URLSearchParams(window.location.search).get('utm_source') || 'direct';
        track('claim_completed', { login: user.login, source });
        setClaimedLogins(prev => new Set(prev).add(user.login));
        let claimedDeveloper = developers.find(developer => developer.login === user.login);
        // If a new profile was created, reload developers to include it
        if (result.created || result.autoApproved) {
          const devRes = await fetch(developerSnapshotUrl(), { cache: 'no-store' });
          if (devRes.ok) {
            const raw = await devRes.json();
            const scored = prepareDeveloperDataset(raw);
            setDevelopers(scored);
            setFiltered(scored);
            const claimed = new Set(raw.filter(d => d.claimed).map(d => d.login));
            setClaimedLogins(claimed);
            cachedDeveloperDataset = { developers: scored, claimedLogins: claimed };
            claimedDeveloper = scored.find(developer => developer.login === user.login);
          }
        } else if (claimedDeveloper) {
          claimedDeveloper = { ...claimedDeveloper, claimed: true };
          const updatedDevelopers = developers.map(developer => developer.login === user.login ? claimedDeveloper : developer);
          const updatedClaimedLogins = new Set(cachedDeveloperDataset?.claimedLogins || []);
          updatedClaimedLogins.add(user.login);
          setDevelopers(updatedDevelopers);
          setFiltered(current => current.map(developer => developer.login === user.login ? claimedDeveloper : developer));
          cachedDeveloperDataset = { developers: updatedDevelopers, claimedLogins: updatedClaimedLogins };
        }

        claimedDeveloper ||= {
          id: user.login,
          login: user.login,
          name: user.name || user.login,
          avatarUrl: user.avatarUrl,
          claimed: true,
        };
        setSelectedDev(claimedDeveloper);
        if (openCard) {
          setCardContext('claim');
          setCardRequest(request => request + 1);
          fetch('/api/profile-completion', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'generated-card' }),
          }).then(response => {
            if (response.ok) setCompletionVersion(version => version + 1);
          }).catch(() => {});
        }
        if (openReadme) setReadmeRequest(request => request + 1);
        setSidebarOpen(false);
        return { ok: true, ...result };
      } else {
        const data = await res.json();
        track('claim_failed', { reason: 'request_failed' });
        console.error('Claim failed:', data.error);
        return { ok: false, ...data };
      }
    } catch (err) {
      track('claim_failed', { reason: 'network_error' });
      console.error('Claim error:', err);
      return { ok: false, error: err.message };
    }
  }, [user, developers]);

  useEffect(() => {
    if (!user) return;
    let pendingUsername = '';
    try { pendingUsername = localStorage.getItem(PENDING_CLAIM_KEY) || ''; } catch { return; }
    if (!pendingUsername) return;

    if (pendingUsername.toLowerCase() !== user.login.toLowerCase()) {
      setVerificationUsername(pendingUsername);
      setShowAddMe(true);
      return;
    }

    const openReadme = localStorage.getItem(PENDING_README_KEY) === pendingUsername.toLowerCase();
    localStorage.removeItem(PENDING_CLAIM_KEY);
    localStorage.removeItem(PENDING_README_KEY);
    void handleClaim({ openCard: !openReadme, openReadme });
  }, [user, handleClaim]);

  const handleToggleTheme = useCallback(() => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem('devglobe-theme', next);
      } catch (err) {
        // ignore persistence failures, theme still applies for this session
      }
      if (next === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
      } else {
        document.documentElement.removeAttribute('data-theme');
      }
      return next;
    });
  }, []);

  const hasActiveSearchRef = useRef(false);

  useEffect(() => {
    if (cachedDeveloperDataset) return;

    let cancelled = false;

    async function loadData() {
      try {
        fetch(publicApiUrl('/api/developers/count'), { signal: AbortSignal.timeout(10000) })
          .then(res => res.ok ? res.json() : null)
          .then(data => {
            if (Number.isInteger(data?.count)) setDatasetCount(data.count);
          })
          .catch(() => {});
        setLoadingStage('downloading');
        const firstRes = await fetch(`/api/developers?limit=${INITIAL_BATCH_SIZE}`, { signal: AbortSignal.timeout(30000) });
        if (!firstRes.ok) throw new Error(`Failed to load data: ${firstRes.status}`);
        setLoadingStage('preparing');
        const firstPage = await firstRes.json();
        if (cancelled) return;

        let rawAll = firstPage.developers;
        let scored = prepareDeveloperDataset(rawAll);
        setDevelopers(scored);
        setFiltered(scored);
        let claimed = new Set(rawAll.filter(d => d.claimed).map(d => d.login));
        setClaimedLogins(claimed);
        cachedDeveloperDataset = { developers: scored, claimedLogins: claimed };
        // The UI is usable now with the first batch; stop the loading overlay and
        // keep fetching the remaining developers quietly in the background.
        setLoading(false);

        let hasMore = firstPage.hasMore;
        let nextCursor = firstPage.nextCursor;
        let nextOffset = firstPage.nextOffset;
        let publishedCount = rawAll.length;
        setDatasetLoading(hasMore);

        const publishDataset = () => {
          scored = prepareDeveloperDataset(rawAll);
          setDevelopers(scored);
          if (!hasActiveSearchRef.current) setFiltered(scored);
          claimed = new Set(rawAll.filter(d => d.claimed).map(d => d.login));
          setClaimedLogins(claimed);
          cachedDeveloperDataset = { developers: scored, claimedLogins: claimed };
          publishedCount = rawAll.length;
        };

        while (hasMore && !cancelled) {
          const pageUrl = nextCursor
            ? `/api/developers?limit=${BACKGROUND_BATCH_SIZE}&cursor=${encodeURIComponent(nextCursor)}`
            : `/api/developers?limit=${BACKGROUND_BATCH_SIZE}&offset=${nextOffset}`;
          const pageRes = await fetch(pageUrl, { signal: AbortSignal.timeout(30000) })
            .catch(() => null);
          if (!pageRes?.ok) break;
          const page = await pageRes.json();
          if (cancelled || !page.developers?.length) break;

          rawAll.push(...page.developers);
          hasMore = page.hasMore;
          nextCursor = page.nextCursor;
          nextOffset = page.nextOffset;
          if (rawAll.length - publishedCount >= BACKGROUND_UI_FLUSH_SIZE || !hasMore) {
            publishDataset();
          }
        }

        if (!cancelled && rawAll.length !== publishedCount) publishDataset();
        if (!cancelled) setDatasetLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err.message);
        setLoading(false);
        setDatasetLoading(false);
      }
    }
    loadData();
    return () => { cancelled = true; };
  }, []);

  const handleSearch = useCallback((results) => {
    hasActiveSearchRef.current = true;
    setSearchActive(true);
    const developerByLogin = new Map(developers.map(developer => [developer.login, developer]));
    const rankedResults = results.map(result => ({
      ...developerByLogin.get(result.login),
      ...result,
    }));
    setSelectedDev(null);
    setCardRequest(0);
    setFiltered(rankedResults);
  }, [developers]);

  const recordPlatformActivity = useCallback((type, targetLogin) => {
    fetch('/api/activities/platform', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, targetLogin }),
    }).catch(() => {});
  }, []);

  const handleGenerateCard = useCallback((developer) => {
    const rankedDeveloper = developers.find(item => item.login === developer.login) || developer;
    if (user?.login?.toLowerCase() === rankedDeveloper.login?.toLowerCase()) {
      fetch('/api/profile-completion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generated-card' }),
      }).then(response => {
        if (response.ok) setCompletionVersion(version => version + 1);
      }).catch(() => {});
    }
    setSelectedDev(rankedDeveloper);
    setCardContext('generate');
    setCardRequest(request => request + 1);
    setSidebarOpen(false);
    if (rankedDeveloper.lat != null && rankedDeveloper.lng != null) {
      setFlyTarget({ lat: rankedDeveloper.lat, lng: rankedDeveloper.lng });
    }
  }, [developers, user]);

  const handleOpenOwnProfile = useCallback(async () => {
    if (!user?.login) return;
    let developer = developers.find(candidate => candidate.login?.toLowerCase() === user.login.toLowerCase());
    if (!developer) {
      const response = await fetch(`/api/developer?id=${encodeURIComponent(user.login)}`, { cache: 'no-store' });
      if (response.ok) developer = await response.json();
    }
    if (!developer) return;
    setCardRequest(0);
    setCardContext(null);
    setSelectedDev(developer);
    setSidebarOpen(false);
    if (developer.lat != null && developer.lng != null) {
      setFlyTarget({ lat: developer.lat, lng: developer.lng });
    }
  }, [developers, user]);

  const handleGenerateOwnCard = useCallback(() => {
    const developer = resolveIdentityCardDeveloper(null, user, developers);
    if (developer) handleGenerateCard(developer);
  }, [developers, handleGenerateCard, user]);

  const handleOpenCardFeature = useCallback(() => {
    const developer = resolveIdentityCardDeveloper(selectedDev, user, developers);
    if (developer) {
      handleGenerateCard(developer);
      return;
    }
    setTourStep('search');
    requestAnimationFrame(() => document.querySelector('#search-bar input')?.focus());
  }, [developers, handleGenerateCard, selectedDev, user]);

  const handleOpenReadmeFeature = useCallback((requestedDeveloper, { recordActivity = true } = {}) => {
    const developer = requestedDeveloper || selectedDev || resolveIdentityCardDeveloper(null, user, developers);
    if (!developer) {
      setTourStep('search');
      requestAnimationFrame(() => document.querySelector('#search-bar input')?.focus());
      return;
    }
    track('profile_readme_opened', { login: developer.login, source: 'home' });
    if (recordActivity) recordPlatformActivity('generated_readme', developer.login);
    setCardRequest(0);
    setCardContext(null);
    setSelectedDev(developer);
    setSidebarOpen(false);
    setReadmeRequest(request => request + 1);
  }, [developers, recordPlatformActivity, selectedDev, user]);

  // Resume a "Generate README" request started from the home menu before sign-in.
  useEffect(() => {
    if (!user || developers.length === 0) return;
    let pendingLogin = '';
    try { pendingLogin = localStorage.getItem(PENDING_HOME_README_KEY) || ''; } catch { return; }
    if (!pendingLogin) return;
    try { localStorage.removeItem(PENDING_HOME_README_KEY); } catch { /* best-effort cleanup */ }
    const developer = developers.find(candidate => candidate.login.toLowerCase() === pendingLogin.toLowerCase());
    if (developer) handleOpenReadmeFeature(developer, { recordActivity: false });
  }, [user, developers, handleOpenReadmeFeature]);

  const handleOpenCompareFeature = useCallback(() => {
    setCardRequest(0);
    setCardContext(null);
    setSelectedDev(null);
    setSidebarView('leaderboard');
    setSidebarOpen(true);
  }, []);

  const completeTour = useCallback(() => {
    setTourStep(null);
    setTourMatch(null);
    try { localStorage.setItem('devglobe-tour-complete', '1'); } catch { /* ignore persistence failures */ }
  }, []);

  const handleTourSearchState = useCallback(({ results }) => {
    if (!tourStep) return;
    if (results.length === 0) {
      setTourMatch(null);
      setTourStep('missing');
    } else if (results.length === 1) {
      setTourMatch(results[0]);
      setTourStep('found');
    } else {
      setTourMatch(null);
      setTourStep('refine');
    }
  }, [tourStep]);

  const handleTourFocusSearch = useCallback(() => {
    setTourStep('search');
    requestAnimationFrame(() => document.querySelector('#search-bar input')?.focus());
  }, []);

  const handleTourAddMe = useCallback(() => {
    setTourMatch(null);
    setTourStep('support');
    setShowAddMe(true);
  }, []);

  const handleTourGenerateCard = useCallback((developer) => {
    setTourMatch(null);
    setTourStep('support');
    handleGenerateCard(developer);
  }, [handleGenerateCard]);

  const handleResetFilter = useCallback(() => {
    hasActiveSearchRef.current = false;
    setSearchActive(false);
    setFiltered(developers);
  }, [developers]);

  const handleSelectDev = useCallback((dev) => {
    setCardRequest(0);
    setCardContext(null);
    setSelectedDev(dev);
    setSidebarOpen(false);
    if (dev?.lat != null && dev?.lng != null) {
      setFlyTarget({ lat: dev.lat, lng: dev.lng });
    }
  }, []);

  // Opens a developer's panel by login, resolving the full record from the
  // loaded dataset first and falling back to a fetch (used by the Trending
  // panel, which only has a lightweight per-developer projection).
  const handleSelectDevByLogin = useCallback((login) => {
    const existing = developers.find(candidate => candidate.login?.toLowerCase() === login.toLowerCase());
    if (existing) {
      handleSelectDev(existing);
      return;
    }
    fetch(`/api/developer?id=${encodeURIComponent(login)}`, { cache: 'no-store' })
      .then(async response => {
        if (!response.ok) return;
        const developer = await response.json();
        if (developer?.login) handleSelectDev(developer);
      })
      .catch(() => {});
  }, [developers, handleSelectDev]);

  // Deep link support: /?dev=login opens that developer's panel and flies
  // the globe to their location on load (see share page's "Explore" link).
  const deepLinkHandledRef = useRef(false);
  useEffect(() => {
    if (deepLinkHandledRef.current) return;
    const login = new URLSearchParams(window.location.search).get('dev')?.trim();
    if (!login || !/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(login)) return;

    const existing = developers.find(candidate => candidate.login?.toLowerCase() === login.toLowerCase());
    if (existing) {
      deepLinkHandledRef.current = true;
      handleSelectDev(existing);
      track('shared_profile_link_opened', { login: existing.login });
      return;
    }

    if (!developers.length) return; // wait for the initial batch before falling back to a fetch
    deepLinkHandledRef.current = true;
    fetch(`/api/developer?id=${encodeURIComponent(login)}`, { cache: 'no-store' })
      .then(async response => {
        if (!response.ok) return;
        const developer = await response.json();
        if (developer?.login) {
          handleSelectDev(developer);
          track('shared_profile_link_opened', { login: developer.login });
        }
      })
      .catch(() => {});
  }, [developers, handleSelectDev]);

  // Trending (#24): fetched once and shared between the sidebar panel and
  // the globe's highlight rings, so both stay in sync off a single request.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/trending')
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to load trending developers');
        if (!cancelled) setTrending(data);
      })
      .catch(err => { if (!cancelled) setTrendingError(err.message); });
    return () => { cancelled = true; };
  }, []);

  const handleOpenSimilar = useCallback((login) => {
    const url = new URL(window.location.href);
    url.searchParams.set('similar', login);
    window.history.pushState({}, '', url);
    setSimilarLogin(login);
  }, []);

  const handleCloseSimilar = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete('similar');
    window.history.replaceState({}, '', url);
    setSimilarLogin('');
  }, []);

  const handleSimilarityResults = useCallback((results) => {
    hasActiveSearchRef.current = true;
    const byLogin = new Map(developers.map(developer => [developer.login.toLowerCase(), developer]));
    setFiltered(results.map(result => ({ ...byLogin.get(result.login.toLowerCase()), ...result })));
  }, [developers]);

  const handleSelectSimilar = useCallback((developer) => {
    handleSelectDev(developer);
    handleCloseSimilar();
    track('next_action_selected', { action: 'open_similar_developer', journey: 'profile_similarity' });
  }, [handleCloseSimilar, handleSelectDev]);

  const handleToggleSidebar = useCallback(() => {
    setSidebarView('leaderboard');
    setSidebarOpen(prev => sidebarView === 'leaderboard' ? !prev : true);
  }, [sidebarView]);

  const handleOpenActivity = useCallback(() => {
    if (sidebarView === 'activity') {
      setSidebarOpen(false);
      setSidebarView('leaderboard');
      return;
    }
    setSidebarView('activity');
    setSidebarOpen(true);
  }, [sidebarView]);

  const handleCloseSidebar = useCallback(() => {
    setSidebarOpen(false);
    setSidebarView('leaderboard');
  }, []);

  const handleSelectCountry = useCallback((country, view) => {
    setCardRequest(0);
    setCardContext(null);
    setSelectedDev(null);
    setSelectedCountry(country);
    if (view) {
      setFlyTarget({ lat: view.lat, lng: view.lng, altitude: view.altitude });
    }
  }, []);

  // Deep link support: /?country=Name (e.g. linked from /countries, #3)
  // selects that country the same way choosing it from the sidebar filter
  // does. Runs once; doesn't fight the user if they clear the filter after.
  const countryDeepLinkHandledRef = useRef(false);
  useEffect(() => {
    if (countryDeepLinkHandledRef.current) return;
    const country = new URLSearchParams(window.location.search).get('country')?.trim();
    if (!country) return;
    countryDeepLinkHandledRef.current = true;
    handleSelectCountry(country);
  }, [handleSelectCountry]);

  const handleClearCountry = useCallback(() => {
    setSelectedCountry('');
  }, []);

  const handleCloseDetail = useCallback(() => {
    setCardContext(null);
    setSelectedDev(null);
    if (new URLSearchParams(window.location.search).has('dev')) {
      const url = new URL(window.location.href);
      url.searchParams.delete('dev');
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    }
  }, []);

  const handleToggleCompare = useCallback((dev) => {
    setCompareDevs(prev => {
      const idx = prev.findIndex(d => d.login === dev.login);
      if (idx >= 0) return prev.filter(d => d.login !== dev.login);
      if (prev.length >= 2) return prev;
      return [...prev, dev];
    });
  }, []);

  // On mobile, the sidebar is a drawer with a full-screen backdrop that sits
  // above the compare panel's own backdrop. If it stays open once the
  // compare panel appears, its backdrop swallows taps meant for the compare
  // panel, so close it here the same way we already do for the detail panel
  // (handleSelectDev).
  useEffect(() => {
    if (compareDevs.length === 2) {
      setSidebarOpen(false);
    }
  }, [compareDevs.length]);

  const handleCloseCompare = useCallback(() => {
    setCompareDevs([]);
  }, []);

  const handleAddMe = useCallback(() => {
    setVerificationUsername('');
    setShowAddMe(true);
  }, []);

  const handleCloseAddMe = useCallback(() => {
    setShowAddMe(false);
  }, []);

  const handleHome = useCallback(() => {
    hasActiveSearchRef.current = false;
    setCardRequest(0);
    setCardContext(null);
    setSelectedDev(null);
    setCompareDevs([]);
    setFiltered(developers);
    setFlyTarget(null);
    setSelectedCountry('');
    setSidebarOpen(false);
  }, [developers]);

  if (error) {
    return <LoadingOverlay error={error} datasetCount={datasetCount} />;
  }

  return (
    <div id="app" className={tourStep ? 'tour-active' : ''} aria-busy={loading}>
      <section className="agent-readable-summary" aria-labelledby="devglobe-summary-title">
        <h1 id="devglobe-summary-title">DevGlobe developer discovery for humans and AI agents</h1>
        <p>
          DevGlobe is a global directory of more than 26,000 public open-source developer profiles.
          Search by name, GitHub username, location, programming language, contribution history, or
          agent availability. Profiles combine public GitHub and Stack Overflow signals into
          transparent rankings, language expertise, project activity, and consent-based collaboration
          preferences. Private contact details are never exposed through public search.
        </p>
        <p>
          Humans can explore the interactive globe, compare developers, review country statistics,
          discover contribution opportunities, and create shareable developer identity cards. AI
          agents can use the public API or stateless MCP endpoint to search profiles and inspect public
          expertise. Introduction requests require a scoped DevGlobe bearer credential and remain
          consent-gated: the developer decides whether to accept before any contact can proceed.
        </p>
        <nav aria-label="Agent and developer resources">
          <a href="/agents">Agent setup</a>
          <a href="/docs/mcp-server">MCP documentation</a>
          <a href="/openapi.json">OpenAPI description</a>
          <a href="/.well-known/api-catalog">API catalog</a>
          <a href="/llms.txt">Agent guide</a>
          <a href="/sitemap.xml">Sitemap</a>
        </nav>
      </section>
      {loading && <LoadingOverlay datasetCount={datasetCount} stage={loadingStage} />}
      <Header
        onHome={handleHome}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        user={user}
        onLogout={handleLogout}
        onClaim={handleClaim}
        onEditAiProfile={() => setShowAiProfile(true)}
        onOpenIntroductions={() => setShowIntroductions(true)}
        onOpenShortlists={() => { setShortlistLogin(''); setShowShortlists(true); }}
        onOpenContributions={() => setShowContributions(true)}
        onOpenSimilar={handleOpenSimilar}
        onOpenProfile={handleOpenOwnProfile}
        onGenerateCard={handleGenerateOwnCard}
        completionVersion={completionVersion}
        claimStatus={claimStatus}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={handleToggleSidebar}
        activityOpen={sidebarView === 'activity'}
        onOpenActivity={handleOpenActivity}
        onAddMe={handleAddMe}
        onStartTour={handleTourFocusSearch}
      />
      <PlatformActivityBanner />
      <SearchBar
        developers={developers}
        onResults={handleSearch}
        onReset={handleResetFilter}
        onSelectDeveloper={handleSelectDev}
        onGenerateCard={handleGenerateCard}
        onSearchState={handleTourSearchState}
        onOpenCardFeature={handleOpenCardFeature}
        onOpenReadmeFeature={handleOpenReadmeFeature}
        readmeTooltip="Preview a generated GitHub profile README"
        onOpenCompareFeature={handleOpenCompareFeature}
        compareCount={compareDevs.length}
        signedIn={Boolean(user)}
        currentUsername={user?.login || ''}
        profileOpen={Boolean(selectedDev)}
        onOpenOwnProfile={handleOpenOwnProfile}
        onOpenActivity={handleOpenActivity}
        showMissionPreview={false}
      />
      <QuickTour
        step={tourStep}
        matchedDeveloper={tourMatch}
        onFocusSearch={handleTourFocusSearch}
        onAddMe={handleTourAddMe}
        onGenerateCard={handleTourGenerateCard}
        onClose={completeTour}
      />
      <a
        className="product-hunt-badge"
        href="https://www.producthunt.com/products/devglobe-2?embed=true&amp;utm_source=badge-featured&amp;utm_medium=badge&amp;utm_campaign=badge-devglobe-2"
        target="_blank"
        rel="noopener noreferrer"
      >
        <img
          alt="DevGlobe - Discover top open source devs on an interactive 3D globe | Product Hunt"
          width="250"
          height="54"
          src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1216204&amp;theme=light&amp;t=1785998968385"
        />
      </a>
      <main className="main">
        <Globe
          ref={globeRef}
          developers={filtered}
          flyTarget={flyTarget}
          selectedCountry={selectedCountry}
          theme={theme}
          onSelectDev={handleSelectDev}
          onSelectCountry={handleSelectCountry}
          onClearCountry={handleClearCountry}
          agentNetworkVisible={agentGlobeLayerVisible}
          tooltipDisabled={Boolean(selectedDev || compareDevs.length === 2)}
          trendingLogins={trending?.gainers?.slice(0, 10).map(entry => entry.login) || []}
        />
        <Leaderboard
          developers={filtered}
          selectedLogin={selectedDev?.login}
          onSelectDev={handleSelectDev}
          countryFilter={selectedCountry}
          onCountryFilterChange={setSelectedCountry}
          compareLogins={compareDevs.map(d => d.login)}
          onToggleCompare={handleToggleCompare}
          onClearCompare={handleCloseCompare}
          claimedLogins={claimedLogins}
          open={sidebarOpen}
          onClose={handleCloseSidebar}
          activeView={sidebarView}
          onViewChange={setSidebarView}
          agentGlobeLayerVisible={agentGlobeLayerVisible}
          onToggleAgentGlobeLayer={setAgentGlobeLayerVisible}
          trending={trending}
          trendingError={trendingError}
          onSelectDevByLogin={handleSelectDevByLogin}
          totalDeveloperCount={datasetCount}
          datasetLoading={datasetLoading && !searchActive}
          onOpenContributions={() => setShowContributions(true)}
        />
        {sidebarOpen && (
          <div className="sidebar-backdrop" onClick={handleCloseSidebar} />
        )}
        {selectedDev && (
          <DetailPanel
            key={`${selectedDev.login}-${cardRequest}`}
            dev={selectedDev}
            onClose={handleCloseDetail}
            onCardGenerated={targetLogin => recordPlatformActivity('generated_card', targetLogin)}
            onReadmeGenerated={targetLogin => recordPlatformActivity('generated_readme', targetLogin)}
            onOpenSimilar={handleOpenSimilar}
            onAddToShortlist={login => { setShortlistLogin(login); setShowShortlists(true); }}
            claimedLogins={claimedLogins}
            user={user}
            onClaim={handleClaim}
            readmeRequest={readmeRequest}
            openCardOnMount={cardRequest > 0}
            claimSuccess={cardContext === 'claim'}
          />
        )}
        {compareDevs.length === 2 && (
          <ComparePanel devs={compareDevs} onClose={handleCloseCompare} />
        )}
        {showAddMe && (
          <AddMeModal
            onClose={handleCloseAddMe}
            user={user}
            onVerify={handleClaim}
            verificationUsername={verificationUsername}
            initialUsername={addMeUsername}
          />
        )}
        {showClaimPending && <ClaimStatusModal onClose={() => setShowClaimPending(false)} />}
        {showAiProfile && (
          <AiProfileModal
            onClose={() => setShowAiProfile(false)}
            onSaved={handleAiProfileSaved}
          />
        )}
        {showIntroductions && (
          <IntroductionInboxModal
            onClose={() => setShowIntroductions(false)}
            onEditPreferences={() => {
              setShowIntroductions(false);
              setShowAiProfile(true);
            }}
          />
        )}
        {showShortlists && (
          <ShortlistManagerModal
            ownerLogin={user.login}
            initialLogin={shortlistLogin}
            onClose={() => setShowShortlists(false)}
            onCompare={profiles => {
              setShowShortlists(false);
              setCompareDevs(profiles);
            }}
          />
        )}
        {showContributions && <ContributionOpportunitiesModal onClose={() => setShowContributions(false)} />}
        {similarLogin && (
          <SimilarDevelopersModal
            login={similarLogin}
            onClose={handleCloseSimilar}
            onResults={handleSimilarityResults}
            onSelect={handleSelectSimilar}
          />
        )}
      </main>
    </div>
  );
}