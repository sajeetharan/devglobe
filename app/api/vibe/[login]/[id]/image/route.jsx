import { ImageResponse } from '@vercel/og';
import { findVibeCard } from '../../../../../../lib/vibe-card-store.js';
import { formatVibeDuration } from '../../../../../../lib/vibe-card.js';

export const runtime = 'nodejs';

function stat(label, value, accent = false) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
      <span style={{ color: accent ? '#67e8f9' : '#f8fafc', fontSize: '30px', fontWeight: 800 }}>{value}</span>
      <span style={{ color: '#71839b', fontSize: '13px', fontWeight: 700, letterSpacing: '1.4px' }}>{label}</span>
    </div>
  );
}

function shortLabel(value, maximum) {
  const text = String(value || '').trim();
  return text.length > maximum ? `${text.slice(0, maximum - 1)}…` : text;
}

export async function GET(_request, { params }) {
  const { login, id } = await params;
  const card = await findVibeCard(login, id);
  if (!card) return new Response('Vibe Card not found', { status: 404 });

  const duration = formatVibeDuration(card.durationMinutes);
  const agent = shortLabel([card.codingAgent, card.codingModel].filter(Boolean).join(' / '), 60);
  const displayName = shortLabel(card.name, 30);
  const language = shortLabel(card.activeLanguage, 20);
  const initial = (card.name || card.login).charAt(0).toUpperCase();

  return new ImageResponse(
    (
      <div style={{
        width: '1200px',
        height: '630px',
        display: 'flex',
        position: 'relative',
        overflow: 'hidden',
        padding: '50px 58px',
        background: '#07111f',
        color: '#f8fafc',
        fontFamily: 'sans-serif',
      }}>
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          opacity: 0.55,
          backgroundImage: 'linear-gradient(rgba(34,211,238,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.07) 1px, transparent 1px)',
          backgroundSize: '42px 42px',
        }} />
        <div style={{ position: 'absolute', top: '-120px', right: '-80px', width: '430px', height: '430px', display: 'flex', border: '72px solid rgba(139,92,246,0.13)', borderRadius: '50%' }} />
        <div style={{ position: 'absolute', left: '58px', top: '50px', right: '58px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '11px', fontSize: '20px', fontWeight: 800 }}>
            <span style={{ width: '11px', height: '11px', display: 'flex', borderRadius: '50%', background: '#22d3ee', boxShadow: '0 0 24px #22d3ee' }} />
            DEV<span style={{ color: '#22d3ee', marginLeft: '-11px' }}>GLOBE</span>
          </div>
          <span style={{ color: '#71839b', fontSize: '15px', fontWeight: 700 }}>VIBE SESSION / SHIPPED</span>
        </div>

        <div style={{ display: 'flex', width: '100%', alignItems: 'stretch', paddingTop: '74px' }}>
          <div style={{ width: '42%', display: 'flex', flexDirection: 'column', justifyContent: 'center', borderRight: '1px solid rgba(148,163,184,0.18)', paddingRight: '54px' }}>
            <span style={{ color: '#67e8f9', fontSize: '22px', fontWeight: 700 }}>TIME IN FLOW</span>
            <span style={{ marginTop: '8px', fontSize: '104px', fontWeight: 800, letterSpacing: '-7px', lineHeight: 0.98 }}>{duration}</span>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '56px', marginTop: '30px' }}>
              {[18, 32, 22, 48, 36, 54, 28, 42, 20, 50, 34, 25, 44, 30, 52, 22, 38, 18].map((height, index) => (
                <span key={index} style={{ width: '8px', height: `${height}px`, display: 'flex', borderRadius: '4px', background: index > 13 ? '#8b5cf6' : '#22d3ee', opacity: 0.45 + index / 34 }} />
              ))}
            </div>
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '54px 0 14px 58px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
              <span style={{ width: '70px', height: '70px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #22d3ee', borderRadius: '18px', background: '#10233a', color: '#67e8f9', fontSize: '34px', fontWeight: 800 }}>{initial}</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '34px', fontWeight: 800 }}>{displayName}</span>
                <span style={{ color: '#8ea0b8', fontSize: '18px' }}>@{card.login}</span>
              </div>
            </div>

            {agent ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '13px 16px', border: '1px solid rgba(139,92,246,0.55)', borderRadius: '10px', background: 'rgba(139,92,246,0.12)', color: '#c4b5fd', fontSize: '17px', fontWeight: 700 }}>
                <span style={{ display: 'flex', color: '#a78bfa' }}>✦</span> Vibed with {agent}
              </div>
            ) : null}

            <div style={{ display: 'flex', gap: '54px' }}>
              {stat('LANGUAGE', language, true)}
              {stat('CODERS NEARBY', card.developerCount)}
              {stat('COUNTRIES', card.countryCount)}
              {card.waveCount ? stat('WAVES', card.waveCount) : null}
            </div>
          </div>
        </div>
        <span style={{ position: 'absolute', bottom: '23px', right: '58px', color: '#52667d', fontSize: '14px', fontWeight: 700 }}>devglobe.dev / code live with the world</span>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' },
    },
  );
}
