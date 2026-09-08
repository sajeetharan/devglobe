'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import GlobeGL from 'react-globe.gl';
import { getLanguageColor } from '../lib/language-colors.js';

const COUNTRY_URLS = [
  'https://cdn.jsdelivr.net/gh/vasturiano/react-globe.gl@507cfce3934e66349522bc80351d7a054e46ab6d/example/datasets/ne_110m_admin_0_countries.geojson',
  'https://raw.githubusercontent.com/vasturiano/react-globe.gl/507cfce3934e66349522bc80351d7a054e46ab6d/example/datasets/ne_110m_admin_0_countries.geojson',
];
const RENDERER_CONFIG = { alpha: true, antialias: true };
const pointLat = developer => developer.lat;
const pointLng = developer => developer.lng;
const pointColor = developer => getLanguageColor(developer.activeLanguage) || '#3b82f6';
const pointAltitude = developer => developer.presenceState === 'live' ? 0.035 : 0.018;
const pointRadius = developer => developer.presenceState === 'live' ? 0.65 : 0.38;
const ringLat = developer => developer.lat;
const ringLng = developer => developer.lng;
const ringColor = developer => () => `${pointColor(developer)}b3`;
const ringMaxRadius = () => 3;
const ringSpeed = () => 1.2;
const ringPeriod = () => 1800;
const polygonCapColor = () => 'rgba(20, 32, 51, 0.86)';
const polygonSideColor = () => 'rgba(10, 14, 23, 0.55)';
const polygonStrokeColor = () => 'rgba(92, 117, 151, 0.3)';

const LiveDeveloperGlobe = forwardRef(function LiveDeveloperGlobe({ developers, onSelect }, forwardedRef) {
  const containerRef = useRef(null);
  const globeRef = useRef(null);
  const [size, setSize] = useState({ width: 800, height: 700 });
  const [countries, setCountries] = useState([]);

  useImperativeHandle(forwardedRef, () => ({
    focus(developer) {
      globeRef.current?.pointOfView({ lat: developer.lat, lng: developer.lng, altitude: 1.25 }, 900);
    },
  }), []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width: Math.max(1, width), height: Math.max(1, height) });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function loadCountries() {
      for (const url of COUNTRY_URLS) {
        try {
          const response = await fetch(url, { signal: controller.signal });
          if (!response.ok) continue;
          const data = await response.json();
          if (data?.features) {
            setCountries(data.features);
            return;
          }
        } catch (error) {
          if (error.name === 'AbortError') return;
        }
      }
    }
    loadCountries();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controls = globeRef.current?.controls();
    if (!controls) return;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.28;
    controls.enablePan = false;
    globeRef.current.pointOfView({ lat: 18, lng: 10, altitude: 2.25 }, 0);
  }, []);

  return (
    <div ref={containerRef} className="live-globe-canvas" aria-label="Interactive globe showing live and recent developer activity">
      <GlobeGL
        ref={globeRef}
        width={size.width}
        height={size.height}
        rendererConfig={RENDERER_CONFIG}
        backgroundColor="rgba(0,0,0,0)"
        globeImageUrl="/globe-ocean.png"
        showAtmosphere
        atmosphereColor="#3b82f6"
        atmosphereAltitude={0.16}
        polygonsData={countries}
        polygonCapColor={polygonCapColor}
        polygonSideColor={polygonSideColor}
        polygonStrokeColor={polygonStrokeColor}
        polygonAltitude={0.006}
        pointsData={developers}
        pointLat={pointLat}
        pointLng={pointLng}
        pointColor={pointColor}
        pointAltitude={pointAltitude}
        pointRadius={pointRadius}
        onPointClick={onSelect}
        ringsData={developers.filter(developer => developer.presenceState === 'live')}
        ringLat={ringLat}
        ringLng={ringLng}
        ringColor={ringColor}
        ringMaxRadius={ringMaxRadius}
        ringPropagationSpeed={ringSpeed}
        ringRepeatPeriod={ringPeriod}
      />
    </div>
  );
});

export default LiveDeveloperGlobe;