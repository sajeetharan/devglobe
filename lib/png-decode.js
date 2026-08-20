import zlib from 'node:zlib';

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/**
 * Decode a non-interlaced, 8-bit PNG (color type 2 RGB or 6 RGBA) into RGBA pixels.
 * Uses only Node's built-in zlib so no third-party dependency is required.
 */
export function decodePng(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  for (let i = 0; i < 8; i += 1) {
    if (buf[i] !== SIGNATURE[i]) throw new Error('Not a PNG image');
  }

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idatChunks = [];

  let pos = 8;
  while (pos < buf.length) {
    const length = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const dataStart = pos + 8;

    if (type === 'IHDR') {
      width = buf.readUInt32BE(dataStart);
      height = buf.readUInt32BE(dataStart + 4);
      bitDepth = buf[dataStart + 8];
      colorType = buf[dataStart + 9];
      interlace = buf[dataStart + 12];
    } else if (type === 'IDAT') {
      idatChunks.push(buf.subarray(dataStart, dataStart + length));
    } else if (type === 'IEND') {
      break;
    }

    pos = dataStart + length + 4; // skip chunk data and its CRC
  }

  if (bitDepth !== 8) throw new Error(`Unsupported PNG bit depth: ${bitDepth}`);
  if (interlace !== 0) throw new Error('Interlaced PNG is not supported');
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (!channels) throw new Error(`Unsupported PNG color type: ${colorType}`);

  const raw = zlib.inflateSync(Buffer.concat(idatChunks));
  const stride = width * channels;
  const out = new Uint8Array(width * height * 4);
  let prev = new Uint8Array(stride);
  let rp = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = raw[rp];
    rp += 1;
    const cur = new Uint8Array(stride);
    for (let i = 0; i < stride; i += 1) {
      const x = raw[rp + i];
      const a = i >= channels ? cur[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let value;
      switch (filter) {
        case 0: value = x; break;
        case 1: value = x + a; break;
        case 2: value = x + b; break;
        case 3: value = x + ((a + b) >> 1); break;
        case 4: value = x + paeth(a, b, c); break;
        default: throw new Error(`Unsupported PNG filter: ${filter}`);
      }
      cur[i] = value & 0xff;
    }
    rp += stride;

    for (let x = 0; x < width; x += 1) {
      const src = x * channels;
      const dst = (y * width + x) * 4;
      out[dst] = cur[src];
      out[dst + 1] = cur[src + 1];
      out[dst + 2] = cur[src + 2];
      out[dst + 3] = channels === 4 ? cur[src + 3] : 255;
    }
    prev = cur;
  }

  return { width, height, data: out };
}
