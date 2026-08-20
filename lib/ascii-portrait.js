const CHARSET = '@%#*+=-:. ';

export const CARD_THEMES = {
  dark: {
    background: '#0d1117',
    border: '#30363d',
    text: '#c9d1d9',
    muted: '#8b949e',
    accent: '#58a6ff',
    highlight: '#7ee787',
    palette: ['#ff7b72', '#ffa657', '#f2cc60', '#7ee787', '#79c0ff', '#d2a8ff'],
  },
  light: {
    background: '#ffffff',
    border: '#d0d7de',
    text: '#24292f',
    muted: '#57606a',
    accent: '#0969da',
    highlight: '#1a7f37',
    palette: ['#cf222e', '#9a6700', '#4d7c0f', '#1a7f37', '#0969da', '#8250df'],
  },
};

export function luminance(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Convert decoded RGBA pixels into an array of ASCII rows.
 * Background-colored / transparent cells become spaces so the portrait is cut out.
 */
export function imageToAscii(image, cols, rows) {
  const { data, width, height } = image;
  const at = (x, y) => {
    const i = (y * width + x) * 4;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  };

  const corners = [at(0, 0), at(width - 1, 0), at(0, height - 1), at(width - 1, height - 1)];
  const bg = [0, 1, 2].map(c => corners.reduce((sum, p) => sum + p[c], 0) / corners.length);

  const lines = [];
  for (let ry = 0; ry < rows; ry += 1) {
    let line = '';
    for (let rx = 0; rx < cols; rx += 1) {
      const x0 = Math.floor((rx * width) / cols);
      const x1 = Math.max(x0 + 1, Math.floor(((rx + 1) * width) / cols));
      const y0 = Math.floor((ry * height) / rows);
      const y1 = Math.max(y0 + 1, Math.floor(((ry + 1) * height) / rows));

      let r = 0; let g = 0; let b = 0; let a = 0; let n = 0;
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const p = at(x, y);
          r += p[0]; g += p[1]; b += p[2]; a += p[3]; n += 1;
        }
      }
      r /= n; g /= n; b /= n; a /= n;

      const distance = Math.sqrt((r - bg[0]) ** 2 + (g - bg[1]) ** 2 + (b - bg[2]) ** 2);
      if (a < 32 || distance < 20) {
        line += ' ';
        continue;
      }
      const index = Math.min(CHARSET.length - 1, Math.max(0, Math.round((luminance(r, g, b) / 255) * (CHARSET.length - 1))));
      line += CHARSET[index];
    }
    lines.push(line.replace(/\s+$/, ''));
  }
  return lines;
}

function infoLine(label, value, y, colors) {
  const labelText = `${label}:`;
  const dots = '.'.repeat(Math.max(2, 20 - labelText.length));
  return `<text x="470" y="${y}" class="line">`
    + `<tspan class="label">${escapeXml(labelText)}</tspan>`
    + `<tspan class="muted"> ${dots} </tspan>`
    + `<tspan class="value">${escapeXml(value)}</tspan>`
    + '</text>';
}

/**
 * Render a terminal-window profile card SVG with an ASCII portrait and info lines.
 * `details` is an array of [label, value]. Pure string output for easy testing.
 */
export function renderProfileCardSvg({ login, portrait = [], details = [], theme = 'dark' } = {}) {
  const colors = CARD_THEMES[theme] || CARD_THEMES.dark;
  const rowCount = Math.max(portrait.length, details.length + 4, 20);
  const height = 70 + rowCount * 18;
  const width = 900;

  const portraitLines = portrait
    .map((line, index) => {
      const color = colors.palette[Math.floor((index / Math.max(portrait.length, 1)) * colors.palette.length)] || colors.text;
      return `<text x="30" y="${70 + index * 15}" class="portrait" fill="${color}" xml:space="preserve">${escapeXml(line)}</text>`;
    })
    .join('\n  ');

  let y = 66;
  const infoLines = [];
  infoLines.push(`<text x="470" y="${y}" class="section">${escapeXml(`@${login}`)}</text>`);
  y += 26;
  for (const [label, value] of details) {
    infoLines.push(infoLine(label, value, y, colors));
    y += 22;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Terminal profile card for ${escapeXml(login)}">
  <style>
    .line, .portrait, .section { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px; }
    .portrait { font-size: 12px; }
    .label { fill: ${colors.accent}; }
    .muted { fill: ${colors.muted}; }
    .value { fill: ${colors.text}; }
    .section { fill: ${colors.highlight}; font-weight: 700; }
  </style>
  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="8" fill="${colors.background}" stroke="${colors.border}" stroke-width="2"/>
  <circle cx="24" cy="24" r="6" fill="#ff5f56"/>
  <circle cx="46" cy="24" r="6" fill="#ffbd2e"/>
  <circle cx="68" cy="24" r="6" fill="#27c93f"/>
  <text x="450" y="29" text-anchor="middle" class="line muted">${escapeXml(login)}@github: ~</text>
  <line x1="440" y1="44" x2="440" y2="${height - 30}" stroke="${colors.border}"/>
  ${portraitLines}
  ${infoLines.join('\n  ')}
  <text x="30" y="${height - 18}" class="line"><tspan class="section" fill="${colors.highlight}">$</tspan><tspan class="value"> building in the open</tspan><tspan class="label">_</tspan></text>
</svg>
`;
}
