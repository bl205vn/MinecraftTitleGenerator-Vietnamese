// Style-preserving transfer for the authored, antialiased reflection overlays.
// Existing atlas glyphs retain the author's pixels. New glyphs use learned
// diagonal stripe/vertical-alpha fields or a shape-aware top/left cartoon bevel.
// These are template adaptations, not claims of exact analytic reconstruction.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
const cache = new Map();
const S = 4, OW = 4000, OH = 1280;
function mod(n, d) { return ((n % d) + d) % d; }
function components(font) {
  const labels = new Int32Array(1000 * 320).fill(-1), boxes = [];
  for (let start = 0; start < labels.length; start++) {
    if (!font.white[start] || labels[start] >= 0) continue;
    const label = boxes.length, queue = [start]; labels[start] = label;
    let x0 = start % 1000, x1 = x0 + 1, y0 = Math.floor(start / 1000), y1 = y0 + 1;
    for (let j = 0; j < queue.length; j++) {
      const p = queue[j], x = p % 1000, y = Math.floor(p / 1000);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x + 1); y0 = Math.min(y0, y); y1 = Math.max(y1, y + 1);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || xx >= 1000 || yy < 0 || yy >= 320) continue;
        const q = yy * 1000 + xx;
        if (font.white[q] && labels[q] < 0) { labels[q] = label; queue.push(q); }
      }
    }
    boxes.push([x0, y0, x1, y1]);
  }
  return { labels, boxes };
}
async function authored(id, ctx) {
  const file = path.join(ctx.source.base, 'overlays', id + '.png');
  if (!cache.has(file)) cache.set(file, (await sharp(fs.readFileSync(file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })).data);
  return cache.get(file);
}
function sourcePixel(x, y) {
  if (y < 172) return [x, y];
  if (y >= 183 && y < 205) return [x, y - 11];
  if (y >= 208 && y < 278) return [x, y - 14];
  return null;
}
function learnStripe(original, font, random) {
  // A's template spans 28x40 atlas pixels, enough to observe the diagonal cycle.
  const r = font.regions.find(r => r.name === 'a'), [x0, y0, x1, y1] = r.box;
  const period = random ? 272 : 128;
  const hit = new Uint32Array(period), total = new Uint32Array(period);
  const alphas = Array.from({ length: (y1 - y0) * S }, () => []);
  for (let y = y0 * S; y < y1 * S; y++) for (let x = x0 * S; x < x1 * S; x++) {
    if (!font.white[Math.floor(y / S) * 1000 + Math.floor(x / S)]) continue;
    const alpha = original[(y * OW + x) * 4 + 3], q = mod(x - x0 * S - (y - y0 * S), period);
    total[q]++; if (alpha) { hit[q]++; alphas[y - y0 * S].push(alpha); }
  }
  const stripe = new Uint8Array(period);
  for (let q = 0; q < period; q++) {
    if (total[q]) stripe[q] = hit[q] / total[q] >= .5 ? 1 : 0;
    else {
      for (let d = 1; d < period; d++) {
        const qq = mod(q - d, period);
        if (total[qq]) { stripe[q] = hit[qq] / total[qq] >= .5 ? 1 : 0; break; }
      }
    }
  }
  const fade = alphas.map((row, i) => {
    if (!row.length) return i ? 255 : 255;
    row.sort((a, b) => a - b); return row[Math.floor(row.length / 2)];
  });
  const palette = [...new Set(Array.from({ length: original.length / 4 }, (_, i) => original[i * 4 + 3]).filter(a => a))].sort((a, b) => a - b);
  const quantize = new Uint8Array(256);
  for (let a = 1; a < 256; a++) quantize[a] = palette.reduce((best, v) => Math.abs(v - a) < Math.abs(best - a) ? v : best, palette[0]);
  return { stripe, fade, period, quantize };
}
export async function generate(id, font, ctx) {
  if (!['cartoon', 'shine', 'shine_random'].includes(id)) throw Error('Unknown reflection overlay: ' + id);
  const original = await authored(id, ctx);
  if (font === ctx.source) return Buffer.from(original);
  const output = Buffer.alloc(OW * OH * 4), mapped = new Uint8Array(1000 * 320);
  // Transfer original style only where Flat's semantic class still matches.
  for (let y = 0; y < 320; y++) for (let x = 0; x < 1000; x++) {
    const i = y * 1000 + x, c = font.c[i], p = sourcePixel(x, y);
    if (!p || c < 1 || c > 3 || ctx.source.c[p[1] * 1000 + p[0]] !== c) continue;
    mapped[i] = 1;
    for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) {
      const a = (((p[1] * S + dy) * OW) + p[0] * S + dx) * 4;
      const b = (((y * S + dy) * OW) + x * S + dx) * 4;
      original.copy(output, b, a, a + 4);
    }
  }
  const cc = components(font), field = id === 'cartoon' ? null : learnStripe(original, ctx.source, id === 'shine_random');
  for (let py = 0; py < 320; py++) for (let px = 0; px < 1000; px++) {
    const i = py * 1000 + px;
    if (!font.white[i] || mapped[i]) continue;
    const [x0, y0, x1, y1] = cc.boxes[cc.labels[i]], width = (x1 - x0) * S, height = (y1 - y0) * S;
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const x = px * S + sx, y = py * S + sy, lx = x - x0 * S, ly = y - y0 * S;
      let alpha;
      if (id === 'cartoon') {
        // An affine inward shear makes triangular lips rather than uniform lines.
        // 5-degree / 7.5-degree-like slopes measured from the original's wedges.
        const shx = .0875, shy = .13, ex = shx * height * .92, ey = shy * width * .92;
        const determinant = 1 - shx * shy;
        let exposed = 0;
        for (let yy = 0; yy < 8; yy++) for (let xx = 0; xx < 8; xx++) {
          const tx = lx + (xx + .5) / 8 - ex, ty = ly + (yy + .5) / 8 - ey;
          const qx = (tx + shx * ty) / determinant, qy = (shy * tx + ty) / determinant;
          const bx = Math.floor(x0 + qx / S), by = Math.floor(y0 + qy / S);
          if (bx < 0 || bx >= 1000 || by < 0 || by >= 320 || !font.white[by * 1000 + bx]) exposed++;
        }
        alpha = Math.round(exposed * 255 / 64);
      } else {
        const seed = id === 'shine_random' ? mod(x0 * 17 + y0 * 31, field.period) : 0;
        if (!field.stripe[mod(lx - ly + seed, field.period)]) continue;
        const fy = y0 >= 240 ? (y0 - 208) * S + ly : ly;
        const base = field.fade[Math.min(field.fade.length - 1, fy)];
        const dither = ((x * 73 + y * 151) >>> 0) % 3 === 0 ? -1 : 0;
        alpha = field.quantize[Math.max(0, base + dither)];
      }
      if (alpha) output.set([255, 255, 255, alpha], (y * OW + x) * 4);
    }
  }
  return output;
}
