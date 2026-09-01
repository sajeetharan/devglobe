import { ImageResponse } from 'next/og';
import { getSiteUrl } from '../lib/site.js';

export const runtime = 'nodejs';
export const alt = 'DevGlobe - Open-source talent and contribution discovery for developers and AI agents through MCP';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  const logoUrl = `${getSiteUrl()}/devglobe.png`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: '#070b0e',
          color: '#f8fafc',
          fontFamily: 'sans-serif',
          padding: '64px 68px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            backgroundImage: 'linear-gradient(rgba(45, 212, 191, 0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(45, 212, 191, 0.055) 1px, transparent 1px)',
            backgroundSize: '38px 38px',
          }}
        />

        <div style={{ width: '620px', display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '13px', marginBottom: '36px' }}>
            <div style={{ width: '12px', height: '12px', display: 'flex', background: '#2dd4bf', borderRadius: '50%', boxShadow: '0 0 18px rgba(45, 212, 191, 0.8)' }} />
            <div style={{ display: 'flex', color: '#5eead4', fontSize: '18px', fontWeight: '800' }}>FOR DEVELOPERS + AI AGENTS</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', fontSize: '64px', fontWeight: '800', lineHeight: 1.02 }}>
            <span>Find the people</span>
            <span style={{ display: 'flex' }}>behind the<span style={{ color: '#5eead4', marginLeft: '14px' }}>code.</span></span>
          </div>
          <div style={{ width: '565px', display: 'flex', marginTop: '24px', color: '#b8c4c1', fontSize: '21px', lineHeight: 1.42 }}>
            Find your first open-source contribution, build a verified profile, and let AI agents discover your expertise through DevGlobe MCP.
          </div>
          <div style={{ width: '570px', display: 'flex', marginTop: '38px', paddingTop: '22px', borderTop: '1px solid #29403a', justifyContent: 'space-between', color: '#f0fdfa', fontSize: '15px', fontWeight: '800' }}>
            <span>26,000+ PROFILES</span>
            <span>150+ COUNTRIES</span>
            <span>AGENT + MCP READY</span>
          </div>
          <div style={{ display: 'flex', marginTop: '34px', color: '#5eead4', fontSize: '19px', fontWeight: '800' }}>
            devglobe.dev
          </div>
        </div>

        <div style={{ position: 'absolute', right: '36px', top: '74px', width: '470px', height: '470px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderLeft: '1px solid #29403a', paddingLeft: '36px' }}>
          <img
            src={logoUrl}
            alt=""
            width="430"
            height="430"
            style={{ width: '430px', height: '430px', objectFit: 'contain' }}
          />
        </div>
      </div>
    ),
    size
  );
}