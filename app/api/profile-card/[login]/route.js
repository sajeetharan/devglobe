import { ImageResponse } from '@vercel/og';
import { decodePng } from '../../../../lib/png-decode.js';
import { imageToAscii, renderProfileCardSvg } from '../../../../lib/ascii-portrait.js';
import { getProfileCardDeveloper, buildCardDetails } from '../../../../lib/profile-card-lookup.js';

export const runtime = 'nodejs';

const LOGIN_PATTERN = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;
const PORTRAIT_COLS = 44;
const PORTRAIT_ROWS = 22;
const AVATAR_SIZE = 96;

function svgResponse(svg, { cache = true } = {}) {
  return new Response(svg, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': cache
        ? 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400'
        : 'no-store',
    },
  });
}

async function fetchAsciiPortrait(login) {
  try {
    // GitHub avatars are often JPEG; rasterize to PNG via @vercel/og so the
    // built-in PNG decoder can read the pixels without a JPEG dependency.
    const png = new ImageResponse(
      {
        type: 'img',
        props: {
          src: `https://github.com/${encodeURIComponent(login)}.png?size=${AVATAR_SIZE}`,
          width: AVATAR_SIZE,
          height: AVATAR_SIZE,
        },
      },
      { width: AVATAR_SIZE, height: AVATAR_SIZE },
    );
    const image = decodePng(Buffer.from(await png.arrayBuffer()));
    return imageToAscii(image, PORTRAIT_COLS, PORTRAIT_ROWS);
  } catch (error) {
    console.error('Profile card portrait failed:', error.message);
    return [];
  }
}

export async function GET(request, { params }) {
  const { login: rawLogin } = await params;
  const login = rawLogin.replace(/\.svg$/i, '');

  const theme = new URL(request.url).searchParams.get('theme') === 'light' ? 'light' : 'dark';

  if (!LOGIN_PATTERN.test(login)) {
    return svgResponse(renderProfileCardSvg({ login: 'invalid', details: [['Error', 'invalid login']], theme }), { cache: false });
  }

  try {
    const [portrait, developer] = await Promise.all([
      fetchAsciiPortrait(login),
      getProfileCardDeveloper(login).catch(() => null),
    ]);
    const details = buildCardDetails(developer, login);
    return svgResponse(renderProfileCardSvg({ login, portrait, details, theme }));
  } catch (error) {
    console.error('Profile card render failed:', error.message);
    return svgResponse(renderProfileCardSvg({ login, details: [['GitHub', `@${login}`]], theme }), { cache: false });
  }
}
