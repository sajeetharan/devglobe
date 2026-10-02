import { ImageResponse } from 'next/og';

export const alt = 'DevGlobe Hacktoberfest issue finder: less searching, more contributing';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: '100%', height: '100%', padding: '60px 72px', background: '#0a0e17', color: '#e2e8f0', borderLeft: '16px solid #fb923c' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 28 }}>
        <span>DevGlobe</span>
        <span style={{ color: '#fb923c' }}>Hacktoberfest 2026</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ display: 'flex', fontSize: 76, fontWeight: 700, lineHeight: 1.1, maxWidth: 980 }}>Less searching. More contributing.</div>
        <div style={{ display: 'flex', fontSize: 28, color: '#94a3b8', maxWidth: 900 }}>Find open issues matched to your DevGlobe language profile.</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 24 }}>
        <span style={{ color: '#22d3ee' }}>No sign-in required</span>
        <span>devglobe.dev/hacktoberfest</span>
      </div>
    </div>,
    size,
  );
}
