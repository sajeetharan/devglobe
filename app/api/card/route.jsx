import { ImageResponse } from '@vercel/og';
import { promises as fs } from 'fs';
import path from 'path';
import { classifyAgent, getPowerTier } from '../../../lib/agent-class.js';
import { scoreAll } from '../../../lib/scoring.js';
import { getSiteHostname } from '../../../lib/site.js';
import { addDeveloperRanks } from '../../../lib/ranking.js';
import { getCosmosContainer } from '../../../lib/cosmos.js';
import { getPublicAiToolNames } from '../../../lib/ai-profile.js';
import { calculateOssWorth } from '../../../lib/oss-worth.js';
import { formatUsd } from '../../../lib/format.js';
import { getDeveloperFunFact } from '../../../lib/card-fun-fact.js';

export const runtime = 'nodejs';

const manropeFonts = Promise.all(
  [400, 600, 700, 800].map(async weight => {
    const fontPath = path.join(
      process.cwd(),
      'node_modules',
      '@fontsource',
      'manrope',
      'files',
      `manrope-latin-${weight}-normal.woff`
    );
    const buffer = await fs.readFile(fontPath);
    return {
      name: 'Manrope',
      data: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
      weight,
      style: 'normal',
    };
  })
);

async function getDeveloper(login) {
  const cosmosContainer = getCosmosContainer();
  if (cosmosContainer) {
    try {
      const { resources } = await cosmosContainer.items.query({
        query: `SELECT TOP 1 c.id, c.login, c.name, c.avatarUrl, c.location, c.followers, c.totalStars, c.totalForks, c.totalWatchers, c.totalCommits, c.topLanguage, c.soReputation, c.soAnswers, c.soAcceptRate, c.soBadges, c.publicRepos, c.claimed, c.score, c.globalRank, c.globalTotal, c.country, c.countryRank, c.countryTotal, c.city, c.cityRank, c.cityTotal, c.aiProfile
          FROM c
          WHERE (c.login = @login OR c.id = @login)
            AND (NOT IS_DEFINED(c.nomination) OR c.nomination.status = 'approved')`,
        parameters: [{ name: '@login', value: login }],
      }).fetchAll();
      if (resources[0]) return resources[0];
    } catch (err) {
      console.error('Card: Cosmos error', err.message);
    }
  }

  const filePath = path.join(process.cwd(), 'data', 'developers-sample.json');
  const raw = await fs.readFile(filePath, 'utf-8');
  const data = JSON.parse(raw);
  const developers = addDeveloperRanks(scoreAll(data));
  return developers.find(d => d.login.toLowerCase() === login.toLowerCase()) || null;
}

function formatNum(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

async function loadAvatarDataUrl(avatarUrl) {
  if (!avatarUrl) return null;

  try {
    const response = await fetch(avatarUrl, {
      signal: AbortSignal.timeout(3000),
      next: { revalidate: 86400 },
    });
    if (!response.ok) return null;

    const contentType = response.headers.get('content-type') || 'image/png';
    const bytes = Buffer.from(await response.arrayBuffer());
    return `data:${contentType};base64,${bytes.toString('base64')}`;
  } catch {
    return null;
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const login = searchParams.get('login');

  if (!login) {
    return new Response('Missing login parameter', { status: 400 });
  }

  const dev = await getDeveloper(login);
  if (!dev) {
    return new Response('Developer not found', { status: 404 });
  }

  const score = Number.isFinite(dev.score) ? dev.score : 0;
  const agent = classifyAgent({ ...dev, score });
  const power = getPowerTier(score);
  const [avatarDataUrl, fonts, funFact] = await Promise.all([
    loadAvatarDataUrl(dev.avatarUrl),
    manropeFonts,
    getDeveloperFunFact(dev),
  ]);
  const avatarInitial = (dev.name || dev.login).trim().charAt(0).toUpperCase();
  const agentMark = agent.name
    .replace(/^The\s+/, '')
    .split(/\s+/)
    .map(word => word.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const hasGlobalRank = Boolean(dev.globalRank && dev.globalTotal);
  const hasCityRank = Boolean(dev.cityRank && dev.city);
  const rankCardWidth = hasCityRank ? '166' : dev.countryRank ? '255' : '522';
  const rankValueFontSize = hasCityRank ? '29' : '34';
  const rankTotalFontSize = hasCityRank ? '12' : '14';
  const aiToolNames = getPublicAiToolNames(dev.aiProfile);
  const ossWorth = calculateOssWorth(dev);

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200',
          height: '630',
          display: 'flex',
          background: 'linear-gradient(135deg, #f8fbff 0%, #eaf8fb 56%, #fff3e6 100%)',
          fontFamily: 'Manrope',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Top identity bar */}
        <div
          style={{
            position: 'absolute',
            top: '28',
            left: '40',
            right: '40',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', color: '#102a43', fontSize: '18', fontWeight: '800', letterSpacing: '1' }}>
            DEV<span style={{ color: '#0891b2' }}>GLOBE</span>
          </div>
          <div style={{ display: 'flex', color: '#52667a', fontSize: '12', fontWeight: '700', letterSpacing: '2' }}>
            OPEN SOURCE IDENTITY · 2026
          </div>
        </div>

        {/* Grid pattern overlay */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            opacity: 0.55,
            backgroundImage: 'linear-gradient(rgba(8,145,178,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(8,145,178,0.08) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />

        {/* Bright identity field behind hero */}
        <div
          style={{
            position: 'absolute',
            top: '76',
            left: '28',
            width: '355',
            height: '500',
            borderRadius: '24',
            background: `linear-gradient(160deg, #ffffffdd 0%, ${agent.color}1f 100%)`,
            border: `1px solid ${agent.color}55`,
            boxShadow: `0 18px 50px ${agent.color}24`,
            display: 'flex',
          }}
        />

        {/* Left side — Contribution hero */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: '400',
            padding: '72px 34px 48px',
          }}
        >
          {/* Hero bust with the GitHub portrait as its head */}
          <div
            style={{
              width: '268',
              height: '300',
              position: 'relative',
              alignItems: 'center',
              flexDirection: 'column',
              display: 'flex',
            }}
          >
            <div style={{ position: 'absolute', top: '108', left: '7', width: '254', height: '182', display: 'flex', background: `linear-gradient(145deg, ${agent.color}66, #090d14 72%)`, borderRadius: '126px 126px 22px 22px', border: `2px solid ${agent.color}88` }} />
            <div style={{ position: 'absolute', top: '126', left: '68', width: '132', height: '166', display: 'flex', background: `linear-gradient(180deg, ${agent.color}, #111827 78%)`, borderRadius: '48px 48px 18px 18px', border: `2px solid ${agent.color}` }} />
            <div style={{ position: 'absolute', top: '164', left: '101', width: '66', height: '66', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#080b10', border: `3px solid ${agent.color}`, transform: 'rotate(45deg)', boxShadow: `0 0 24px ${agent.color}99` }}>
              <div
                style={{
                  display: 'flex',
                  transform: 'rotate(-45deg)',
                  color: '#f8fafc',
                  fontSize: '21',
                  fontWeight: '800',
                }}
              >
                {agentMark}
              </div>
            </div>
            <div style={{ position: 'absolute', top: '4', width: '142', height: '142', display: 'flex', borderRadius: '50%', border: `5px solid ${agent.color}`, overflow: 'hidden', background: '#111827', boxShadow: `0 0 38px ${agent.color}66` }}>
              {avatarDataUrl ? (
                <img src={avatarDataUrl} width="142" height="142" style={{ borderRadius: '50%', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: '142', height: '142', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', background: `${agent.color}22`, color: agent.color, fontSize: '58', fontWeight: '800' }}>
                  {avatarInitial}
                </div>
              )}
            </div>
            <div style={{ position: 'absolute', top: '132', width: '116', height: '18', display: 'flex', background: agent.color, borderRadius: '2px 2px 12px 12px', boxShadow: `0 5px 16px ${agent.color}66` }} />
          </div>

          {/* Name */}
          <div
            style={{
              color: '#102a43',
              fontSize: '25',
              fontWeight: '700',
              marginTop: '4',
              display: 'flex',
              textAlign: 'center',
            }}
          >
            {dev.name || dev.login}
          </div>

          {/* Login */}
          <div
            style={{
              color: '#52667a',
              fontSize: '16',
              display: 'flex',
              marginTop: '3',
            }}
          >
            @{dev.login}
          </div>

          {/* Location */}
          {dev.location && (
            <div
              style={{
                color: '#52667a',
                fontSize: '12',
                display: 'flex',
                marginTop: '6',
              }}
            >
              LOCATION · {dev.location}
            </div>
          )}
        </div>

        {/* Right side — Stats + Agent info */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            flex: 1,
            padding: '74px 60px 54px 20px',
          }}
        >
          {/* Agent class header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12',
              marginBottom: '8',
            }}
          >
            <div
              style={{
                color: '#087f8c',
                fontSize: '14',
                fontWeight: '600',
                letterSpacing: '3',
                textTransform: 'uppercase',
                display: 'flex',
              }}
            >
              AGENT CLASS
            </div>
          </div>

          <div
            style={{
              color: '#102a43',
              fontSize: '36',
              fontWeight: '700',
              display: 'flex',
              marginBottom: '4',
            }}
          >
            {agent.name}
          </div>

          <div
            style={{
              color: '#52667a',
              fontSize: '16',
              fontStyle: 'italic',
              display: 'flex',
              marginBottom: '24',
            }}
          >
            &ldquo;{agent.tagline}&rdquo;
          </div>

          {/* Global and local rank */}
          {hasGlobalRank && <div style={{ display: 'flex', gap: '12', marginBottom: '22' }}>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                width: rankCardWidth,
                height: '82',
                padding: '12px 18px',
                background: 'linear-gradient(135deg, #dff8fc, #ffffff)',
                border: '1px solid #79d7e5',
                borderRadius: '8',
                boxShadow: '0 8px 18px rgba(8,145,178,0.10)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '4', width: '100%' }}>
                <span style={{ color: '#087f8c', fontSize: rankValueFontSize, fontWeight: '800', lineHeight: '1' }}>#{formatNum(dev.globalRank)}</span>
                <span style={{ color: '#52667a', fontSize: rankTotalFontSize, whiteSpace: 'nowrap' }}>of {formatNum(dev.globalTotal)}</span>
              </div>
              <div style={{ display: 'flex', color: '#0e7490', fontSize: '12', fontWeight: '700', letterSpacing: '1.1' }}>GLOBAL RANK</div>
            </div>
            {dev.countryRank && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  width: rankCardWidth,
                  height: '82',
                  padding: '12px 18px',
                  background: 'linear-gradient(135deg, #fff0dc, #ffffff)',
                  border: '1px solid #f6b66f',
                  borderRadius: '8',
                  boxShadow: '0 8px 18px rgba(234,88,12,0.08)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '4', width: '100%' }}>
                  <span style={{ color: '#c2410c', fontSize: rankValueFontSize, fontWeight: '800', lineHeight: '1' }}>#{formatNum(dev.countryRank)}</span>
                  <span style={{ color: '#52667a', fontSize: rankTotalFontSize, whiteSpace: 'nowrap' }}>of {formatNum(dev.countryTotal)}</span>
                </div>
                <div style={{ display: 'flex', color: '#c2410c', fontSize: '12', fontWeight: '700', letterSpacing: '0.8' }}>IN {dev.country.toUpperCase()}</div>
              </div>
            )}
            {hasCityRank && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  width: rankCardWidth,
                  height: '82',
                  padding: '12px 18px',
                  background: 'linear-gradient(135deg, #f1eaff, #ffffff)',
                  border: '1px solid #bca6ef',
                  borderRadius: '8',
                  boxShadow: '0 8px 18px rgba(109,40,217,0.08)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '4', width: '100%' }}>
                  <span style={{ color: '#6d28d9', fontSize: rankValueFontSize, fontWeight: '800', lineHeight: '1' }}>#{formatNum(dev.cityRank)}</span>
                  <span style={{ color: '#52667a', fontSize: rankTotalFontSize, whiteSpace: 'nowrap' }}>of {formatNum(dev.cityTotal)}</span>
                </div>
                <div style={{ display: 'flex', color: '#6d28d9', fontSize: '12', fontWeight: '700', letterSpacing: '0.8' }}>IN {dev.city.toUpperCase()}</div>
              </div>
            )}
          </div>}

          {/* Score + Tier */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16',
              marginBottom: '20',
              width: '100%',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: '6',
              }}
            >
              <div
                style={{
                  color: power.color,
                  fontSize: '48',
                  fontWeight: '800',
                  lineHeight: '1',
                  display: 'flex',
                }}
              >
                {score}
              </div>
              <div
                style={{
                  color: '#52667a',
                  fontSize: '20',
                  display: 'flex',
                }}
              >
                /100
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '2',
              }}
            >
              <div
                style={{
                  background: `${power.color}18`,
                  border: `1px solid ${power.color}99`,
                  borderRadius: '6',
                  padding: '4px 12px',
                  color: power.color,
                  fontSize: '13',
                  fontWeight: '700',
                  letterSpacing: '2',
                  display: 'flex',
                }}
              >
                {power.tier}-TIER · {power.label}
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                marginLeft: 'auto',
                minWidth: '190',
                padding: '9px 14px',
                background: 'linear-gradient(135deg, #06b6d4, #087f8c)',
                border: '1px solid #087f8c',
                borderRadius: '8',
                boxShadow: '0 10px 22px rgba(8,145,178,0.22)',
              }}
            >
              <div style={{ display: 'flex', color: '#cffafe', fontSize: '11', fontWeight: '800', letterSpacing: '1.1', marginBottom: '3' }}>
                OSS WORTH
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8' }}>
                <span style={{ color: '#f8fafc', fontSize: '23', fontWeight: '800' }}>{formatUsd(ossWorth.totalCredits, true)}</span>
                <span style={{ color: '#cffafe', fontSize: '11', fontWeight: '700' }}>{formatNum(ossWorth.totalCredits)} OSC</span>
              </div>
            </div>
          </div>

          {/* Stats grid */}
          <div
            style={{
              display: 'flex',
              gap: '10',
              flexWrap: 'wrap',
            }}
          >
            {[
              { label: 'STARS', value: formatNum(dev.totalStars || 0), color: '#f0c040' },
              { label: 'COMMITS', value: formatNum(dev.totalCommits || 0), color: '#8b5cf6' },
              { label: 'FOLLOWERS', value: formatNum(dev.followers || 0), color: '#3b82f6' },
              { label: 'SO REP', value: formatNum(dev.soReputation || 0), color: '#f48024' },
            ].map((stat) => (
              <div
                key={stat.label}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  background: '#ffffff',
                  border: '1px solid #cfdae5',
                  borderRadius: '8',
                  padding: '10px 14px',
                  minWidth: '120',
                  boxShadow: '0 7px 16px rgba(16,42,67,0.07)',
                }}
              >
                <div
                  style={{
                    color: '#52667a',
                    fontSize: '12',
                    fontWeight: '600',
                    letterSpacing: '1.1',
                    display: 'flex',
                    marginBottom: '4',
                  }}
                >
                  {stat.label}
                </div>
                <div
                  style={{
                    color: stat.color,
                    fontSize: '21',
                    fontWeight: '700',
                    display: 'flex',
                  }}
                >
                  {stat.value}
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: '9',
              marginTop: '12',
              color: '#52667a',
              fontSize: '12',
            }}
          >
            <span style={{ display: 'flex', flexShrink: '0', color: '#c2410c', fontSize: '11', fontWeight: '800', letterSpacing: '1' }}>
              FUN FACT
            </span>
            <span style={{ display: 'flex' }}>{funFact}</span>
          </div>

          {aiToolNames.length > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10',
                marginTop: '14',
                color: '#52667a',
                fontSize: '12',
                lineHeight: '1.4',
              }}
            >
              <div style={{ display: 'flex', flexShrink: '0', color: '#087f8c', fontSize: '11', fontWeight: '800', letterSpacing: '1' }}>
                AI TOOLKIT
              </div>
              <div style={{ display: 'flex', flex: '1' }}>
                {aiToolNames.join('  ·  ')}
              </div>
            </div>
          )}

          {/* Language badge */}
          {dev.topLanguage && (
            <div
              style={{
                display: 'flex',
                marginTop: aiToolNames.length > 0 ? '10' : '20',
                gap: '8',
                alignItems: 'center',
              }}
            >
              <div
                style={{
                  background: '#ffffff',
                  border: '1px solid #cfdae5',
                  borderRadius: '20',
                  padding: '6px 14px',
                  color: '#52667a',
                  fontSize: '13',
                  display: 'flex',
                }}
              >
                {dev.topLanguage}
              </div>
              {dev.claimed && (
                <div
                  style={{
                    background: 'rgba(46,164,79,0.15)',
                    border: '1px solid rgba(46,164,79,0.4)',
                    borderRadius: '20',
                    padding: '6px 14px',
                    color: '#2ea44f',
                    fontSize: '13',
                    fontWeight: '600',
                    display: 'flex',
                  }}
                >
                  VERIFIED
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom branding bar */}
        <div
          style={{
            position: 'absolute',
            bottom: '0',
            left: '0',
            right: '0',
            height: '48',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0px 40px',
            background: '#102a43',
            borderTop: '1px solid #234a68',
          }}
        >
          <div
            style={{
              color: '#d6e4ee',
              fontSize: '14',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '8',
            }}
          >
            DEVGLOBE / OPEN SOURCE IDENTITY
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '18' }}>
            <div style={{ color: '#67e8f9', fontSize: '13', fontWeight: '700', display: 'flex' }}>
              #buildinpublic
            </div>
            <div style={{ color: '#b7cad8', fontSize: '13', display: 'flex' }}>
              {getSiteHostname()}
            </div>
          </div>
        </div>

        {/* Top-right corner accent */}
        <div
          style={{
            position: 'absolute',
            top: '-60',
            right: '-60',
            width: '200',
            height: '200',
            borderRadius: '50%',
            background: `radial-gradient(circle, ${agent.color}2a 0%, transparent 70%)`,
            display: 'flex',
          }}
        />
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts,
      headers: {
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
      },
    }
  );
}
