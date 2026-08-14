'use client';

import React, { useEffect, useRef, useMemo, useState, forwardRef, useImperativeHandle, useCallback } from 'react';
import GlobeGL from 'react-globe.gl';
import { getPlatformColor } from '../lib/scoring.js';
import { formatNum } from '../lib/format.js';
import { extractCountry, countryKey } from '../lib/country.js';

// Low-res Natural Earth countries (177 features), pinned to the commit that added
// the dataset so the shapes can't change under us. Second entry is a mirror.
const COUNTRY_GEOJSON_URLS = [
  'https://cdn.jsdelivr.net/gh/vasturiano/react-globe.gl@507cfce3934e66349522bc80351d7a054e46ab6d/example/datasets/ne_110m_admin_0_countries.geojson',
  'https://raw.githubusercontent.com/vasturiano/react-globe.gl/507cfce3934e66349522bc80351d7a054e46ab6d/example/datasets/ne_110m_admin_0_countries.geojson',
];

// Kept below the lowest developer point (0.01) so points stay hoverable
const POLYGON_ALTITUDE = 0.003;
const POLYGON_ALTITUDE_ACTIVE = 0.009;

// Score-based color gradient (visual tiering only, not a judgment of skill)
function getScoreColor(score) {
  if (score >= 80) return '#fbbf24'; // gold — top of the indexed range
  if (score >= 60) return '#34d399'; // emerald — upper-mid range
  if (score >= 40) return '#3b82f6'; // blue — mid range
  return '#6366f1'; // indigo — lower range
}

function featureName(feat) {
  return feat?.properties?.ADMIN || feat?.properties?.NAME || '';
}

// Stable accessors — a new identity makes react-globe.gl rebuild the whole layer,
// and hovering a country re-renders this component.
const devLat = d => d.lat;
const devLng = d => d.lng;
const pointAltitude = d => 0.01 + (d.score / 100) * 0.06;
const pointRadius = d => 0.3 + (d.score / 100) * 0.7;
const pointColor = d => getScoreColor(d.score);
const ringMaxRadius = d => d.maxR;
const ringPropagationSpeed = d => d.propagationSpeed;
const ringRepeatPeriod = d => d.repeatPeriod;
const ringColor = d => () => d.color;
const labelText = d => d.login;
const labelSize = d => 0.6 + (d.score / 100) * 0.4;
const labelColor = () => 'rgba(226, 232, 240, 0.75)';
const noLabel = () => '';
const avatarAltitude = () => 0.018;
const avatarLat = d => d.markerLat;
const avatarLng = d => d.markerLng;
const arcStartLat = d => d.startLat;
const arcStartLng = d => d.startLng;
const arcEndLat = d => d.endLat;
const arcEndLng = d => d.endLng;
const arcColor = d => d.color;
const arcLabel = d => d.label;

function createAvatarMarker(developer, onSelectDev, setAutoRotate) {
  const marker = document.createElement('div');
  marker.className = 'globe-avatar-marker';
  marker.style.setProperty('--marker-color', getScoreColor(developer.score));
  marker.setAttribute('role', 'button');
  marker.setAttribute('tabindex', '0');
  marker.setAttribute('aria-label', `Open ${developer.name || developer.login}'s profile`);
  marker.title = developer.name || developer.login;

  const selectDeveloper = (event) => {
    event.stopPropagation();
    onSelectDev(developer);
  };
  marker.addEventListener('pointerdown', event => event.stopPropagation());
  marker.addEventListener('mousedown', event => event.stopPropagation());
  marker.addEventListener('mouseup', event => event.stopPropagation());
  marker.addEventListener('click', selectDeveloper);
  marker.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectDeveloper(event);
    }
  });
  marker.addEventListener('mouseenter', () => setAutoRotate(false));
  marker.addEventListener('mouseleave', () => setAutoRotate(true));
  marker.addEventListener('focus', () => setAutoRotate(false));
  marker.addEventListener('blur', () => setAutoRotate(true));

  const image = document.createElement('img');
  image.src = developer.avatarUrl;
  image.alt = '';
  image.loading = 'lazy';
  image.referrerPolicy = 'no-referrer';
  marker.appendChild(image);

  return marker;
}

function ringArea(ring) {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    area += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return Math.abs(area / 2);
}

// Biggest outer ring, so scattered countries (USA, Russia) target their mainland
function mainRing(geometry) {
  if (!geometry) return null;
  const polygons = geometry.type === 'MultiPolygon' ? geometry.coordinates : [geometry.coordinates];
  let best = null;
  let bestArea = -1;
  for (const polygon of polygons) {
    const area = ringArea(polygon[0]);
    if (area > bestArea) {
      bestArea = area;
      best = polygon[0];
    }
  }
  return best;
}

function pointInRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [lngI, latI] = ring[i];
    const [lngJ, latJ] = ring[j];
    if (((latI > lat) !== (latJ > lat)) &&
        lng < ((lngJ - lngI) * (lat - latI)) / (latJ - latI) + lngI) {
      inside = !inside;
    }
  }
  return inside;
}

// Centroid of a country plus a camera altitude that roughly frames it
function countryView(feat) {
  const ring = mainRing(feat?.geometry);
  if (!ring || ring.length < 3) return null;

  // Unwrap longitudes so rings crossing the antimeridian stay contiguous
  const lng0 = ring[0][0];
  const pts = ring.map(([lng, lat]) => [lng - 360 * Math.round((lng - lng0) / 360), lat]);

  let twiceArea = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const cross = pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
    twiceArea += cross;
    cx += (pts[j][0] + pts[i][0]) * cross;
    cy += (pts[j][1] + pts[i][1]) * cross;
  }

  let lat;
  let lng;
  if (Math.abs(twiceArea) < 1e-9) {
    lng = pts.reduce((sum, p) => sum + p[0], 0) / pts.length;
    lat = pts.reduce((sum, p) => sum + p[1], 0) / pts.length;
  } else {
    lng = cx / (3 * twiceArea);
    lat = cy / (3 * twiceArea);
  }
  lng = ((lng + 540) % 360) - 180;

  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const [x, y] of pts) {
    if (y < minLat) minLat = y;
    if (y > maxLat) maxLat = y;
    if (x < minLng) minLng = x;
    if (x > maxLng) maxLng = x;
  }
  const span = Math.max(maxLat - minLat, (maxLng - minLng) * Math.cos(lat * Math.PI / 180));

  return { lat, lng, altitude: Math.min(2.2, Math.max(0.55, span / 40)) };
}

function countryMarkerPosition(feat) {
  const ring = mainRing(feat?.geometry);
  const view = countryView(feat);
  if (!ring || !view) return null;
  if (pointInRing(view.lng, view.lat, ring)) return view;

  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  ring.forEach(([lng, lat]) => {
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
  });

  let best = null;
  let bestDistance = Infinity;
  for (let row = 1; row < 20; row++) {
    const lat = minLat + ((maxLat - minLat) * row) / 20;
    for (let column = 1; column < 20; column++) {
      const lng = minLng + ((maxLng - minLng) * column) / 20;
      if (!pointInRing(lng, lat, ring)) continue;
      const distance = (lat - view.lat) ** 2 + (lng - view.lng) ** 2;
      if (distance < bestDistance) {
        best = { lat, lng };
        bestDistance = distance;
      }
    }
  }

  return best ? { ...best, altitude: view.altitude } : { lat: ring[0][1], lng: ring[0][0], altitude: view.altitude };
}

const Globe = forwardRef(function Globe({
  developers,
  flyTarget,
  selectedCountry,
  theme,
  onSelectDev,
  onSelectCountry,
  onClearCountry,
  tooltipDisabled = false,
}, ref) {
  const globeEl = useRef();
  const tooltipRef = useRef(null);
  const pointerDownPos = useRef(null);
  const tooltipFrame = useRef(null);
  const reducedMotion = useRef(false);
  const [countryFeatures, setCountryFeatures] = useState([]);
  const [hoverCountry, setHoverCountry] = useState(null);
  const [hoverDev, setHoverDev] = useState(null);
  const isLight = theme === 'light';

  const geoDevs = useMemo(() => {
    let list = developers.filter(d => d.lat != null && d.lng != null);

    if (selectedCountry) {
      const wanted = countryKey(selectedCountry);
      list = list.filter(d => d.location && countryKey(extractCountry(d.location)) === wanted);
    }

    return list
      .sort((a, b) => b.score - a.score)
      .slice(0, 5000);
  }, [developers, selectedCountry]);

  const labelDevs = useMemo(() => {
    return geoDevs.filter(d => d.score >= 80);
  }, [geoDevs]);

  // Show one top developer per represented country and use country geometry rather
  // than unreliable profile geocodes for the avatar's visual anchor.
  const avatarDevs = useMemo(() => {
    if (countryFeatures.length === 0) return [];

    const featureByCountry = new Map(
      countryFeatures.map(feature => [countryKey(featureName(feature)), feature])
    );
    const representedCountries = new Set();
    const markers = [];
    const limit = selectedCountry ? 1 : 40;

    for (const developer of geoDevs) {
      const key = countryKey(extractCountry(developer.location));
      if (!key || representedCountries.has(key)) continue;

      const position = countryMarkerPosition(featureByCountry.get(key));
      if (!position) continue;

      representedCountries.add(key);
      markers.push({ ...developer, markerLat: position.lat, markerLng: position.lng });
      if (markers.length >= limit) break;
    }

    return markers;
  }, [countryFeatures, geoDevs, selectedCountry]);

  // Dynamic animated arcs on hover connecting developer to top collaborators
  const arcsData = useMemo(() => {
    if (!hoverDev || !hoverDev.collaborators || hoverDev.collaborators.length === 0) {
      return [];
    }
    if (hoverDev.lat == null || hoverDev.lng == null) {
      return [];
    }

    const sourceColor = getScoreColor(hoverDev.score);
    return hoverDev.collaborators
      .filter(c => c.lat != null && c.lng != null)
      .slice(0, 5)
      .map(collab => {
        const targetColor = getScoreColor(collab.score ?? hoverDev.score);
        return {
          startLat: hoverDev.lat,
          startLng: hoverDev.lng,
          endLat: collab.lat,
          endLng: collab.lng,
          color: [sourceColor, targetColor],
          sourceLogin: hoverDev.login,
          targetLogin: collab.login,
          targetName: collab.name || collab.login,
          repo: collab.repo || 'shared repo',
          label: `Collaborates with @${collab.login} on ${collab.repo || 'shared repo'}`,
        };
      });
  }, [hoverDev]);

  // Pulsing rings for top 10 developers + active hovered developer's collaborators
  const ringsData = useMemo(() => {
    const base = geoDevs.slice(0, 10).map(d => ({
      lat: d.lat,
      lng: d.lng,
      maxR: 3,
      propagationSpeed: 2,
      repeatPeriod: 1200,
      color: getScoreColor(d.score),
      login: d.login,
    }));

    if (hoverDev?.collaborators?.length && hoverDev.lat != null && hoverDev.lng != null) {
      const collabRings = hoverDev.collaborators
        .filter(c => c.lat != null && c.lng != null)
        .slice(0, 5)
        .map(c => ({
          lat: c.lat,
          lng: c.lng,
          maxR: 4,
          propagationSpeed: 3,
          repeatPeriod: 900,
          color: '#38bdf8',
          login: c.login,
        }));
      return [...base, ...collabRings];
    }

    return base;
  }, [geoDevs, hoverDev]);

  // Developers per country, keyed the same way the leaderboard filters
  const devCountByCountry = useMemo(() => {
    const counts = new Map();
    developers.forEach(d => {
      if (!d.location) return;
      const key = countryKey(extractCountry(d.location));
      if (key) counts.set(key, (counts.get(key) || 0) + 1);
    });
    return counts;
  }, [developers]);

  const selectedFeature = useMemo(() => {
    if (!selectedCountry) return null;
    const key = countryKey(selectedCountry);
    return countryFeatures.find(f => countryKey(featureName(f)) === key) || null;
  }, [selectedCountry, countryFeatures]);

  // Country borders — the globe still works if the CDN is unreachable
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const url of COUNTRY_GEOJSON_URLS) {
        try {
          const res = await fetch(url);
          if (!res.ok) continue;
          const geo = await res.json();
          if (cancelled) return;
          setCountryFeatures((geo.features || []).filter(f => f.properties?.ISO_A2 !== 'AQ'));
          return;
        } catch {
          // try the next mirror
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleGlobeReady = useCallback(() => {
    const globe = globeEl.current;
    if (!globe) return;

    globe.renderer().setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    reducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const controls = globeEl.current?.controls();
    if (controls) {
      controls.autoRotate = !reducedMotion.current;
      controls.autoRotateSpeed = 0.4;
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.rotateSpeed = 0.6;
      controls.zoomSpeed = 0.8;
    }
  }, []);

  // Fly to target
  useEffect(() => {
    if (flyTarget && globeEl.current) {
      globeEl.current.pointOfView({ lat: flyTarget.lat, lng: flyTarget.lng, altitude: flyTarget.altitude ?? 1.5 }, 1000);
      const controls = globeEl.current.controls();
      if (controls) controls.autoRotate = false;
    }
  }, [flyTarget]);

  useImperativeHandle(ref, () => ({
    flyTo: (lat, lng) => {
      globeEl.current?.pointOfView({ lat, lng, altitude: 1.5 }, 1000);
    },
  }));

  const setAutoRotate = useCallback((on) => {
    const controls = globeEl.current?.controls();
    // Stay still while a country is in focus
    if (controls) controls.autoRotate = on && !selectedCountry && !reducedMotion.current;
  }, [selectedCountry]);

  const avatarElement = useCallback(
    developer => createAvatarMarker(developer, onSelectDev, setAutoRotate),
    [onSelectDev, setAutoRotate],
  );

  useEffect(() => {
    if (!tooltipDisabled) return;
    tooltipRef.current?.classList.remove('visible');
    setHoverCountry(null);
    setHoverDev(null);
  }, [tooltipDisabled]);

  const handleHover = useCallback((point) => {
    const tooltip = tooltipRef.current;
    if (!tooltip) return;

    if (tooltipDisabled) {
      setHoverDev(null);
      tooltip.classList.remove('visible');
      return;
    }

    setHoverDev(point || null);

    if (point) {
      const collabs = point.collaborators?.slice(0, 5) || [];
      const collabHtml = collabs.length > 0 ? `
        <div class="tooltip__collaborators">
          <div class="tooltip__collab-header">🤝 Collaboration Network (${collabs.length})</div>
          ${collabs.map(c => `
            <div class="tooltip__collab-item">
              Collaborates with <strong>@${c.login}</strong> on <span class="tooltip__collab-repo">${c.repo}</span>
            </div>
          `).join('')}
        </div>
      ` : '';

      tooltip.innerHTML = `
        <div class="tooltip__header">
          <img class="tooltip__avatar" src="${point.avatarUrl}" alt="${point.login}">
          <div>
            <div class="tooltip__name">${point.name || point.login}</div>
            <div class="tooltip__login">@${point.login}</div>
          </div>
        </div>
        <div class="tooltip__score">Score: ${point.score}/100</div>
        <div class="tooltip__stats">
          <span>⭐ ${formatNum(point.totalStars || 0)}</span>
          <span>👥 ${formatNum(point.followers || 0)}</span>
          ${point.soReputation ? `<span class="tooltip__so">SO ${formatNum(point.soReputation)}</span>` : ''}
        </div>
        <div class="tooltip__meta">
          <span>📍 ${point.location || 'Unknown'}</span>
          ${point.topLanguage ? `<span>· ${point.topLanguage}</span>` : ''}
        </div>
        ${collabHtml}
      `;
      tooltip.classList.add('visible');
      setAutoRotate(false);
    } else {
      tooltip.classList.remove('visible');
      setAutoRotate(true);
    }
  }, [setAutoRotate, tooltipDisabled]);

  const handleClick = useCallback((point) => {
    if (point) onSelectDev(point);
  }, [onSelectDev]);

  const polygonAltitude = useCallback((f) => (
    f === hoverCountry || f === selectedFeature ? POLYGON_ALTITUDE_ACTIVE : POLYGON_ALTITUDE
  ), [hoverCountry, selectedFeature]);

  const polygonCapColor = useCallback((f) => {
    if (f === selectedFeature) return 'rgba(251, 191, 36, 0.28)';
    if (f === hoverCountry) return 'rgba(96, 165, 250, 0.30)';
    return 'rgba(59, 130, 246, 0.05)';
  }, [hoverCountry, selectedFeature]);

  const polygonSideColor = useCallback((f) => (
    f === hoverCountry || f === selectedFeature ? 'rgba(96, 165, 250, 0.20)' : 'rgba(59, 130, 246, 0.06)'
  ), [hoverCountry, selectedFeature]);

  const polygonStrokeColor = useCallback((f) => {
    if (f === selectedFeature) return '#fbbf24';
    if (f === hoverCountry) return '#93c5fd';
    return 'rgba(148, 163, 184, 0.35)';
  }, [hoverCountry, selectedFeature]);

  const handleCountryHover = useCallback((feat) => {
    const tooltip = tooltipRef.current;
    if (!tooltip) return;

    if (tooltipDisabled) {
      setHoverCountry(null);
      tooltip.classList.remove('visible');
      return;
    }

    setHoverCountry(feat || null);

    if (feat) {
      const name = featureName(feat);
      const safeName = String(name).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
      const count = devCountByCountry.get(countryKey(name)) || 0;
      tooltip.innerHTML = `
        <div class="tooltip__name">${safeName}</div>
        <div class="tooltip__score">${count ? `${formatNum(count)} developer${count === 1 ? '' : 's'}` : 'No developers yet'}</div>
        <div class="tooltip__meta"><span>Click to focus this country</span></div>
      `;
      tooltip.classList.add('visible');
      setAutoRotate(false);
    } else {
      tooltip.classList.remove('visible');
      setAutoRotate(true);
    }
  }, [devCountByCountry, setAutoRotate, tooltipDisabled]);

  const handleCountryClick = useCallback((feat) => {
    if (!feat) return;
    onSelectCountry?.(featureName(feat), countryView(feat));
  }, [onSelectCountry]);

  // Ocean (globe surface not covered by a country polygon)
  const handleGlobeClick = useCallback(() => {
    onClearCountry?.();
  }, [onClearCountry]);

  const handlePointerDown = useCallback((e) => {
    pointerDownPos.current = { x: e.clientX, y: e.clientY };
  }, []);

  // Empty space around the globe — globe.gl has no callback for it
  const handleContainerClick = useCallback((e) => {
    const down = pointerDownPos.current;
    pointerDownPos.current = null;
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return; // camera drag
    const rect = e.currentTarget.getBoundingClientRect();
    const coords = globeEl.current?.toGlobeCoords(e.clientX - rect.left, e.clientY - rect.top);
    if (!coords) onClearCountry?.();
  }, [onClearCountry]);

  // Track mouse for tooltip
  useEffect(() => {
    const handler = (e) => {
      if (!tooltipRef.current || tooltipDisabled) return;
      const x = e.clientX + 12;
      const y = e.clientY + 12;
      if (tooltipFrame.current) cancelAnimationFrame(tooltipFrame.current);
      tooltipFrame.current = requestAnimationFrame(() => {
        if (tooltipRef.current) tooltipRef.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        tooltipFrame.current = null;
      });
    };
    document.addEventListener('mousemove', handler);
    return () => {
      document.removeEventListener('mousemove', handler);
      if (tooltipFrame.current) cancelAnimationFrame(tooltipFrame.current);
    };
  }, [tooltipDisabled]);

  return (
    <>
      <div id="globe-container" onPointerDown={handlePointerDown} onClick={handleContainerClick}>
        <GlobeGL
          ref={globeEl}
          globeImageUrl={isLight
            ? 'https://unpkg.com/three-globe@2.31.0/example/img/earth-blue-marble.jpg'
            : 'https://unpkg.com/three-globe@2.31.0/example/img/earth-night.jpg'}
          bumpImageUrl="https://unpkg.com/three-globe@2.31.0/example/img/earth-topology.png"
          backgroundImageUrl={isLight ? null : 'https://unpkg.com/three-globe@2.31.0/example/img/night-sky.png'}
          backgroundColor={isLight ? '#f4f6fb' : '#000003'}
          showAtmosphere={true}
          atmosphereColor={isLight ? '#7ba7d9' : '#3a7ecf'}
          atmosphereAltitude={0.25}
          onGlobeReady={handleGlobeReady}
          polygonsData={countryFeatures}
          polygonAltitude={polygonAltitude}
          polygonCapColor={polygonCapColor}
          polygonSideColor={polygonSideColor}
          polygonStrokeColor={polygonStrokeColor}
          polygonLabel={noLabel}
          polygonsTransitionDuration={250}
          onPolygonHover={handleCountryHover}
          onPolygonClick={handleCountryClick}
          onGlobeClick={handleGlobeClick}
          pointsData={geoDevs}
          pointLat={devLat}
          pointLng={devLng}
          pointAltitude={pointAltitude}
          pointRadius={pointRadius}
          pointColor={pointColor}
          pointResolution={6}
          htmlElementsData={avatarDevs}
          htmlLat={avatarLat}
          htmlLng={avatarLng}
          htmlAltitude={avatarAltitude}
          htmlElement={avatarElement}
          htmlTransitionDuration={250}
          ringsData={ringsData}
          ringLat={devLat}
          ringLng={devLng}
          ringMaxRadius={ringMaxRadius}
          ringPropagationSpeed={ringPropagationSpeed}
          ringRepeatPeriod={ringRepeatPeriod}
          ringColor={ringColor}
          labelsData={labelDevs}
          labelLat={devLat}
          labelLng={devLng}
          labelText={labelText}
          labelSize={labelSize}
          labelColor={labelColor}
          labelDotRadius={0.3}
          labelAltitude={0.02}
          arcsData={arcsData}
          arcStartLat={arcStartLat}
          arcStartLng={arcStartLng}
          arcEndLat={arcEndLat}
          arcEndLng={arcEndLng}
          arcColor={arcColor}
          arcAltitude={0.25}
          arcStroke={0.6}
          arcDashLength={0.9}
          arcDashGap={2}
          arcDashInitialGap={1}
          arcDashAnimateTime={1800}
          arcsTransitionDuration={300}
          arcLabel={arcLabel}
          onPointHover={handleHover}
          onPointClick={handleClick}
        />
      </div>
      <div className="globe-legend">
        <span className="globe-legend__item"><span className="globe-legend__dot" style={{ background: '#fbbf24' }} />Elite (80+)</span>
        <span className="globe-legend__item"><span className="globe-legend__dot" style={{ background: '#34d399' }} />Strong (60+)</span>
        <span className="globe-legend__item"><span className="globe-legend__dot" style={{ background: '#3b82f6' }} />Solid (40+)</span>
        <span className="globe-legend__item"><span className="globe-legend__dot" style={{ background: '#6366f1' }} />Emerging</span>
      </div>
      <div className="tooltip" ref={tooltipRef} />
    </>
  );
});

export default Globe;