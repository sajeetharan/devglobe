'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import QuickTour from '../components/QuickTour.jsx';
import PlatformActivityBanner from '../components/PlatformActivityBanner.jsx';
import { scoreAll } from '../lib/scoring.js';
import { addDeveloperRanks } from '../lib/ranking.js';
import { enrichWithCollaborators } from '../lib/collaboration.js';
import { withOssWorth } from '../lib/oss-worth.js';
import dynamic from 'next/dynamic';

const Globe = dynamic(() => import('../components/Globe.jsx'), { ssr: false });
const PENDING_CLAIM_KEY = 'devglobe-pending-claim';
let cachedDeveloperDataset = null;

export default function Home() {
  const [developers, setDevelopers] = useState(() => cachedDeveloperDataset?.developers || []);
  const [datasetCount, setDatasetCount] = useState(null);
  const [filtered, setFiltered] = useState(() => cachedDeveloperDataset?.developers || []);
  const [selectedDev, setSelectedDev] = useState(null);
  const [loading, setLoading] = useState(() => !cachedDeveloperDataset);
  const [error, setError] = useState(null);
  const [flyTarget, setFlyTarget] = useState(null);
  const [selectedCountry, setSelectedCountry] = useState('');
  const [compareDevs, setCompareDevs] = useState([]);
  const [theme, setTheme] = useState('dark');
  const [user, setUser] = useState(null);
  const [claimStatus, setClaimStatus] = useState('unclaimed'); // 'unclaimed' | 'pending' | 'claimed' | 'no_match'
  const [claimedLogins, setClaimedLogins] = useState(() => new Set(cachedDeveloperDataset?.claimedLogins || []));
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarView, setSidebarView] = useState('leaderboard');
  const [cardRequest, setCardRequest] = useState(0);
  const [cardContext, setCardContext] = useState(null);
  const [showAddMe, setShowAddMe] = useState(false);
  const [verificationUsername, setVerificationUsername] = useState('');
  const [showClaimPending, setShowClaimPending] = useState(false);
  const [showAiProfile, setShowAiProfile] = useState(false);
  const [showIntroductions, setShowIntroductions] = useState(false);
  const [agentGlobeLayerVisible, setAgentGlobeLayerVisible] = useState(false);
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
    try {
      if (!localStorage.getItem('devglobe-tour-complete')) setTourStep('search');
    } catch { /* localStorage unavailable; leave the tour closed */ }
  }, []);

  // Fetch session on mount
  useEffect(() => {
    async function loadSession() {
      try {
        const res = await fetch('/api/auth/session');
        const data = await res.json();
        if (data.user) {
          setUser(data.user);
        }
      } catch { /* not authenticated */ }
    }
    loadSession();
  }, []);

  // Check claim status when user and developers are loaded
  useEffect(() => {
    if (!user || developers.length === 0) return;
    const match = developers.find(d => d.login === user.login);
    if (match?.claimed) {
      setClaimStatus('claimed');
      setClaimedLogins(prev => new Set(prev).add(user.login));
    } else {
      setClaimStatus('unclaimed');
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
  }, [user]);

  const handleClaim = useCallback(async () => {
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
        setClaimedLogins(prev => new Set(prev).add(user.login));
        let claimedDeveloper = developers.find(developer => developer.login === user.login);
        // If a new profile was created, reload developers to include it
        if (result.created || result.autoApproved) {
          const devRes = await fetch('/api/developers', { cache: 'no-store' });
          if (devRes.ok) {
            const raw = await devRes.json();
            const scored = enrichWithCollaborators(addDeveloperRanks(scoreAll(raw))).map(withOssWorth);
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
        setCardContext('claim');
        setCardRequest(request => request + 1);
        setSidebarOpen(false);
        return { ok: true, ...result };
      } else {
        const data = await res.json();
        console.error('Claim failed:', data.error);
        return { ok: false, ...data };
      }
    } catch (err) {
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

    localStorage.removeItem(PENDING_CLAIM_KEY);
    void handleClaim();
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

  useEffect(() => {
    if (cachedDeveloperDataset) return;

    async function loadData() {
      try {
        fetch('/api/developers/count', { signal: AbortSignal.timeout(10000) })
          .then(res => res.ok ? res.json() : null)
          .then(data => {
            if (Number.isInteger(data?.count)) setDatasetCount(data.count);
          })
          .catch(() => {});

        const res = await fetch('/api/developers', { signal: AbortSignal.timeout(30000) });
        if (!res.ok) throw new Error(`Failed to load data: ${res.status}`);
        const raw = await res.json();
        const scored = enrichWithCollaborators(addDeveloperRanks(scoreAll(raw))).map(withOssWorth);
        setDevelopers(scored);
        setFiltered(scored);
        // Build set of all claimed logins from data
        const claimed = new Set(raw.filter(d => d.claimed).map(d => d.login));
        setClaimedLogins(claimed);
        cachedDeveloperDataset = { developers: scored, claimedLogins: claimed };
        setLoading(false);
      } catch (err) {
        setError(err.message);
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const handleSearch = useCallback((results) => {
    const developerByLogin = new Map(developers.map(developer => [developer.login, developer]));
    const rankedResults = results.map(result => ({
      ...developerByLogin.get(result.login),
      ...result,
    }));
    setSelectedDev(null);
    setCardRequest(0);
    setFiltered(rankedResults);
  }, [developers]);

  const recordCardActivity = useCallback((targetLogin) => {
    fetch('/api/activities/platform', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'generated_card', targetLogin }),
    }).catch(() => {});
  }, []);

  const handleGenerateCard = useCallback((developer) => {
    const rankedDeveloper = developers.find(item => item.login === developer.login) || developer;
    recordCardActivity(rankedDeveloper.login);
    setSelectedDev(rankedDeveloper);
    setCardContext('generate');
    setCardRequest(request => request + 1);
    setSidebarOpen(false);
    if (rankedDeveloper.lat != null && rankedDeveloper.lng != null) {
      setFlyTarget({ lat: rankedDeveloper.lat, lng: rankedDeveloper.lng });
    }
  }, [developers, recordCardActivity]);

  const handleOpenCardFeature = useCallback(() => {
    const developer = selectedDev || (user ? developers.find(item => item.login === user.login) : null);
    if (developer) {
      handleGenerateCard(developer);
      return;
    }
    document.querySelector('#search-bar input')?.focus();
  }, [developers, handleGenerateCard, selectedDev, user]);

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

  const handleClearCountry = useCallback(() => {
    setSelectedCountry('');
  }, []);

  const handleCloseDetail = useCallback(() => {
    setCardContext(null);
    setSelectedDev(null);
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
    setCardRequest(0);
    setCardContext(null);
    setSelectedDev(null);
    setCompareDevs([]);
    setFiltered(developers);
    setFlyTarget(null);
    setSelectedCountry('');
    setSidebarOpen(false);
  }, [developers]);

  if (loading || error) {
    return <LoadingOverlay error={error} datasetCount={datasetCount} />;
  }

  return (
    <div id="app" className={tourStep ? 'tour-active' : ''}>
      <Header
        onHome={handleHome}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        user={user}
        onLogout={handleLogout}
        onClaim={handleClaim}
        onEditAiProfile={() => setShowAiProfile(true)}
        onOpenIntroductions={() => setShowIntroductions(true)}
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
        onGenerateCard={handleGenerateCard}
        onSearchState={handleTourSearchState}
        onOpenCardFeature={handleOpenCardFeature}
        onOpenCompareFeature={handleOpenCompareFeature}
        compareCount={compareDevs.length}
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
        />
        {sidebarOpen && (
          <div className="sidebar-backdrop" onClick={handleCloseSidebar} />
        )}
        {selectedDev && (
          <DetailPanel
            key={`${selectedDev.login}-${cardRequest}`}
            dev={selectedDev}
            onClose={handleCloseDetail}
            onCardGenerated={recordCardActivity}
            claimedLogins={claimedLogins}
            user={user}
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
          />
        )}
        {showClaimPending && <ClaimStatusModal onClose={() => setShowClaimPending(false)} />}
        {showAiProfile && (
          <AiProfileModal
            onClose={() => setShowAiProfile(false)}
            onSaved={handleAiProfileSaved}
          />
        )}
        {showIntroductions && <IntroductionInboxModal onClose={() => setShowIntroductions(false)} />}
      </main>
    </div>
  );
}