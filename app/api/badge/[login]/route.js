import sharp from 'sharp';
import { BADGE_STATS, DEFAULT_BADGE_STAT, renderBadgeSvg, resolveBadgeStat } from '../../../../lib/badge.js';
import { getBadgeDeveloper } from '../../../../lib/badge-lookup.js';
import { checkBadgeRateLimit, getClientKey } from '../../../../lib/badge-rate-limit.js';

export const runtime = 'nodejs';

const LOGIN_PATTERN = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;
const PNG_SCALE = 2; // render at 2x for crisp badges on high-DPI embeds

async function svgToPng(svg) {
  const widthMatch = svg.match(/width="(\d+)"/);
  const heightMatch = svg.match(/height="(\d+)"/);
  const width = widthMatch ? Number(widthMatch[1]) * PNG_SCALE : undefined;
  const height = heightMatch ? Number(heightMatch[1]) * PNG_SCALE : undefined;
  return sharp(Buffer.from(svg), { density: 96 * PNG_SCALE })
    .resize(width, height)
    .png()
    .toBuffer();
}

async function imageResponse(svg, { format, cache = true, status = 200 } = {}) {
  const headers = {
    // Badges are meant to be embedded (README, personal sites) and read on
    // every page view, so cache briefly at the edge instead of per-request.
    // This s-maxage window IS the invalidation semantics: a stat can take up
    // to an hour to reflect a fresh score/rank on an embedded badge, with a
    // day of stale-while-revalidate so a slow origin never breaks the image.
    'Cache-Control': cache
      ? 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400'
      : 'no-store',
  };

  if (format === 'png') {
    const png = await svgToPng(svg);
    return new Response(png, { status, headers: { ...headers, 'Content-Type': 'image/png' } });
  }
  return new Response(svg, { status, headers: { ...headers, 'Content-Type': 'image/svg+xml; charset=utf-8' } });
}

export async function GET(request, { params }) {
  const { login: rawLogin } = await params;
  const pngMatch = rawLogin.match(/\.png$/i);
  const format = pngMatch ? 'png' : 'svg';
  const login = rawLogin.replace(/\.(svg|png)$/i, '');

  // Soft origin-level abuse guard; the CDN cache above is the primary
  // defense against hotlinking/scraping traffic (see lib/badge-rate-limit.js).
  const { limited, retryAfterSeconds } = checkBadgeRateLimit(getClientKey(request));
  if (limited) {
    return new Response(null, {
      status: 429,
      headers: { 'Retry-After': String(retryAfterSeconds), 'Cache-Control': 'no-store' },
    });
  }

  if (!LOGIN_PATTERN.test(login)) {
    return imageResponse(renderBadgeSvg({ value: 'invalid login', unranked: true }), { format, cache: false, status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const statParam = searchParams.get('stat') || DEFAULT_BADGE_STAT;
  if (!BADGE_STATS.includes(statParam)) {
    return imageResponse(renderBadgeSvg({ value: 'invalid stat', unranked: true }), { format, cache: false, status: 400 });
  }

  try {
    const developer = await getBadgeDeveloper(login);
    const { value, unranked, claimed } = resolveBadgeStat(developer, statParam);
    return imageResponse(renderBadgeSvg({ value, unranked, claimed }), { format });
  } catch (error) {
    console.error('Badge render failed:', error.message);
    // Degrade to an "unranked" badge rather than a broken image in READMEs.
    return imageResponse(renderBadgeSvg({ value: 'unavailable', unranked: true }), { format, cache: false, status: 200 });
  }
}
