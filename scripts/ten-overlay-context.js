import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
export const W = 1000, H = 320;
export function classes(data) {
  const out = new Uint8Array(data.length / 4);
  for (let i = 0; i < out.length; i++) if (data[i * 4 + 3]) {
    const c = data[i * 4]; out[i] = c === 255 ? 1 : c === 176 ? 2 : c === 84 ? 3 : 4;
  }
  return out;
}
export function distance(mask, w = W, h = H) {
  const d = new Uint16Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!mask[i]) continue;
    d[i] = Math.min(x ? d[i - 1] : 0, y ? d[i - w] : 0,
      x && y ? d[i - w - 1] : 0, y && x + 1 < w ? d[i - w + 1] : 0) + 1;
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x;
    if (!mask[i]) continue;
    d[i] = Math.min(d[i], Math.min(x + 1 < w ? d[i + 1] : 0, y + 1 < h ? d[i + w] : 0,
      x && y + 1 < h ? d[i + w - 1] : 0, x + 1 < w && y + 1 < h ? d[i + w + 1] : 0) + 1);
  }
  return d;
}
export async function loadContext(root) {
  async function read(font) {
    const base = path.join(root, 'fonts', font);
    const raw = fs.readFileSync(path.join(base, 'textures/flat.png'));
    const { data, info } = await sharp(raw).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const c = classes(data), white = c.map(v => v === 1 ? 1 : 0);
    const regions = [], seen = new Set();
    for (const f of fs.readdirSync(path.join(base, 'characters')).filter(f => f.endsWith('.json'))) {
      const model = JSON.parse(fs.readFileSync(path.join(base, 'characters', f)));
      for (const e of model.elements) {
        if (!e.faces.north || !e.to.every((v, i) => v > e.from[i])) continue;
        const uv = e.faces.north.uv.map((v, i) => Math.round(v * (i % 2 ? 20 : 62.5)));
        const box = [Math.min(uv[0], uv[2]), Math.min(uv[1], uv[3]), Math.max(uv[0], uv[2]), Math.max(uv[1], uv[3])];
        if (seen.has(box.join())) continue;
        seen.add(box.join()); regions.push({ name: f.slice(0, -5), box });
      }
    }
    return { base, data, raw, info, c, white, distance: distance(white), regions };
  }
  const source = await read('minecraft-ten'), target = await read('minecraft-ten-vietnamese');
  return { root, source, target, W, H };
}
export function binary(data) {
  const out = Buffer.alloc(W * H * 4);
  for (let i = 0; i < data.length; i++) if (data[i]) out.set([255, 255, 255, 255], i * 4);
  return out;
}
