/**
 * make-icon.cjs
 * Generates a valid 128x128 PNG icon for the VS Code extension.
 * Uses only Node.js built-ins — no npm packages needed.
 */
'use strict';
const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

const W = 128, H = 128;

// ── Build raw RGBA pixel data ────────────────────────────────────────────
// Deep dark circle (bg-editor #08080a) with a cyan lightning bolt center
function drawIcon() {
  const rgba = Buffer.alloc(W * H * 4, 0);

  function setPixel(x, y, r, g, b, a = 255) {
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    const i = (y * W + x) * 4;
    rgba[i] = r; rgba[i+1] = g; rgba[i+2] = b; rgba[i+3] = a;
  }

  function fillCircle(cx, cy, rad, r, g, b) {
    for (let y = cy - rad; y <= cy + rad; y++) {
      for (let x = cx - rad; x <= cx + rad; x++) {
        const dx = x - cx, dy = y - cy;
        if (dx*dx + dy*dy <= rad*rad) setPixel(x, y, r, g, b);
      }
    }
  }

  function drawGradientCircle(cx, cy, rad) {
    for (let y = cy - rad; y <= cy + rad; y++) {
      for (let x = cx - rad; x <= cx + rad; x++) {
        const dx = x - cx, dy = y - cy;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist <= rad) {
          // Deep indigo-to-violet radial gradient
          const t = dist / rad;
          const ri = Math.round(13  + (30  - 13)  * t);
          const gi = Math.round(14  + (14  - 14)  * t);
          const bi = Math.round(18  + (33  - 18)  * t);
          setPixel(x, y, ri, gi, bi);
        }
      }
    }
  }

  function drawGlowRing(cx, cy, rad, r, g, b) {
    for (let y = cy - rad - 4; y <= cy + rad + 4; y++) {
      for (let x = cx - rad - 4; x <= cx + rad + 4; x++) {
        const dx = x - cx, dy = y - cy;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist >= rad - 2 && dist <= rad + 2) {
          const alpha = Math.round(255 * (1 - Math.abs(dist - rad) / 2.5));
          if (alpha > 0) setPixel(x, y, r, g, b, Math.min(alpha, 255));
        }
      }
    }
  }

  // Background: transparent
  // Circle fill: dark card #0d0e12
  drawGradientCircle(64, 64, 60);

  // Glow ring: cyan
  drawGlowRing(64, 64, 60, 34, 211, 238);

  // Draw lightning bolt ⚡ (simplified polygon)
  // Top-right part of bolt (going down-left)
  const boltPoints = [
    [72, 22], [56, 58], [68, 58], [52, 102], [76, 60], [62, 60], [78, 22]
  ];
  // Fill the bolt shape using scanline
  function fillPolygon(pts, r, g, b) {
    let minY = Math.min(...pts.map(p=>p[1]));
    let maxY = Math.max(...pts.map(p=>p[1]));
    for (let y = minY; y <= maxY; y++) {
      const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const p1 = pts[i], p2 = pts[(i+1) % pts.length];
        if ((p1[1] <= y && p2[1] > y) || (p2[1] <= y && p1[1] > y)) {
          const x = p1[0] + (y - p1[1]) / (p2[1] - p1[1]) * (p2[0] - p1[0]);
          xs.push(Math.round(x));
        }
      }
      xs.sort((a,b) => a-b);
      for (let k = 0; k < xs.length - 1; k += 2) {
        for (let x = xs[k]; x <= xs[k+1]; x++) setPixel(x, y, r, g, b);
      }
    }
  }

  fillPolygon(boltPoints, 34, 211, 238); // cyan bolt

  // Bright center glow
  fillCircle(64, 62, 5, 167, 235, 252);

  return rgba;
}

// ── PNG encoder (pure Node.js) ─────────────────────────────────────────
function encodePNG(width, height, rgba) {
  function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const typeB = Buffer.from(type, 'ascii');
    const body  = Buffer.concat([typeB, data]);
    const crcVal = crc32(body);
    const crcB  = Buffer.alloc(4); crcB.writeUInt32BE(crcVal >>> 0);
    return Buffer.concat([len, body, crcB]);
  }

  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c;
    }
    return t;
  })();

  function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF);
  }

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width,  0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8]  = 8;  // bit depth
  ihdr[9]  = 6;  // color type: RGBA
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace

  // IDAT: filter each scanline with None filter (0x00), then DEFLATE
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter type: None
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const compressed = zlib.deflateSync(raw, { level: 6 });

  const sig  = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Write icon ──────────────────────────────────────────────────────────
const outPath = path.join(__dirname, 'vscode-extension', 'media', 'icon.png');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
const pngBuf = encodePNG(W, H, drawIcon());
fs.writeFileSync(outPath, pngBuf);
console.log('✅  Icon written to: ' + outPath + ' (' + pngBuf.length + ' bytes)');
