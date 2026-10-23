// Offline orthographic renderer for reviewing border contacts from above and below.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backup = path.resolve(root, process.argv[2]);
const manifest = JSON.parse(fs.readFileSync(path.join(backup, 'manifest.json'), 'utf8'));
const atlas = await sharp(path.join(root, 'fonts/minecraft-ten-vietnamese/textures/flat.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const names = ['creeper_breve_dotbelow.json', 'creeper_circumflex_hookabove.json', 'ắ.json', 'ớ.json'];
const W = 260, H = 290, top = 32, width = W * 4, height = H * names.length + top;
const output = Buffer.alloc(width * height * 4);
for (let p = 0; p < output.length; p += 4) { output[p] = 49; output[p + 1] = 54; output[p + 2] = 61; output[p + 3] = 255; }
const dot = (a, b) => a.reduce((n, v, i) => n + v * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const d = Math.hypot(...a); return a.map(v => v / d); };
const defs = { north: [2, 'from', -1], south: [2, 'to', 1], east: [0, 'to', 1], west: [0, 'from', -1], up: [1, 'to', 1], down: [1, 'from', -1] };
function uvAt(e, side, p) {
  const [fx, fy, fz] = e.from, [tx, ty, tz] = e.to, [x, y, z] = p; let u, v;
  if (side === 'north' || side === 'south') { u = side === 'north' ? (tx - x) / (tx - fx) : (x - fx) / (tx - fx); v = (ty - y) / (ty - fy); }
  else if (side === 'east' || side === 'west') { u = side === 'east' ? (tz - z) / (tz - fz) : (z - fz) / (tz - fz); v = (ty - y) / (ty - fy); }
  else { u = (x - fx) / (tx - fx); v = side === 'up' ? (z - fz) / (tz - fz) : (tz - z) / (tz - fz); }
  const uv = e.faces[side].uv; return [uv[0] + (uv[2] - uv[0]) * u, uv[1] + (uv[3] - uv[1]) * v];
}
function render(model, view, ox, oy) {
  const right = norm(cross([0, 1, 0], view)), up = cross(view, right), faces = [];
  for (const e of model.elements) for (const side of Object.keys(e.faces)) {
    const [axis, end, baseNormal] = defs[side], axes = [0, 1, 2].filter(a => a !== axis), normal = [0, 0, 0];
    normal[axis] = baseNormal * Math.sign((e.to[axes[0]] - e.from[axes[0]]) * (e.to[axes[1]] - e.from[axes[1]]));
    if (dot(normal, view) <= 0) continue;
    const vertices = [[0, 0], [1, 0], [1, 1], [0, 1]].map(bits => {
      const p = [0, 0, 0]; p[axis] = e[end][axis];
      for (let i = 0; i < 2; i++) p[axes[i]] = bits[i] ? Math.max(e.from[axes[i]], e.to[axes[i]]) : Math.min(e.from[axes[i]], e.to[axes[i]]);
      return { p, x: dot(p, right), y: dot(p, up), z: dot(p, view) };
    });
    faces.push({ e, side, normal, vertices });
  }
  const all = faces.flatMap(f => f.vertices), xmin = Math.min(...all.map(p => p.x)), xmax = Math.max(...all.map(p => p.x)), ymin = Math.min(...all.map(p => p.y)), ymax = Math.max(...all.map(p => p.y));
  const scale = Math.min((W - 20) / (xmax - xmin), (H - 40) / (ymax - ymin));
  const cx = (xmin + xmax) / 2, cy = (ymin + ymax) / 2, depth = new Float64Array(W * H).fill(-Infinity);
  for (const f of faces) {
    const ps = f.vertices.map(v => ({ ...v, sx: W / 2 + (v.x - cx) * scale, sy: H / 2 + 9 - (v.y - cy) * scale }));
    for (const tri of [[0, 1, 2], [0, 2, 3]]) {
      const [a, b, c] = tri.map(i => ps[i]), den = (b.sy - c.sy) * (a.sx - c.sx) + (c.sx - b.sx) * (a.sy - c.sy);
      if (Math.abs(den) < 1e-10) continue;
      const x0 = Math.max(0, Math.floor(Math.min(a.sx, b.sx, c.sx))), x1 = Math.min(W - 1, Math.ceil(Math.max(a.sx, b.sx, c.sx)));
      const y0 = Math.max(0, Math.floor(Math.min(a.sy, b.sy, c.sy))), y1 = Math.min(H - 1, Math.ceil(Math.max(a.sy, b.sy, c.sy)));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const aa = ((b.sy - c.sy) * (x + .5 - c.sx) + (c.sx - b.sx) * (y + .5 - c.sy)) / den;
        const bb = ((c.sy - a.sy) * (x + .5 - c.sx) + (a.sx - c.sx) * (y + .5 - c.sy)) / den, cc = 1 - aa - bb;
        if (aa < -1e-8 || bb < -1e-8 || cc < -1e-8) continue;
        const z = aa * a.z + bb * b.z + cc * c.z, index = y * W + x;
        if (z < depth[index] - 1e-8) continue;
        const p = [0, 1, 2].map(i => aa * a.p[i] + bb * b.p[i] + cc * c.p[i]), uv = uvAt(f.e, f.side, p);
        const tx = Math.max(0, Math.min(999, Math.floor(uv[0] * 62.5))), ty = Math.max(0, Math.min(319, Math.floor(uv[1] * 20))), source = (ty * 1000 + tx) * 4;
        if (atlas.data[source + 3] < 128) continue;
        const shade = .62 + .38 * Math.max(0, dot(f.normal, norm([-.5, 1, -1]))), target = ((oy + y) * width + ox + x) * 4;
        for (let i = 0; i < 3; i++) output[target + i] = Math.round(atlas.data[source + i] * shade);
        depth[index] = z;
      }
    }
  }
}
for (const [row, name] of names.entries()) {
  if (!manifest.records.some(r => r.filename === name)) continue;
  const before = JSON.parse(fs.readFileSync(path.join(backup, 'characters', name), 'utf8'));
  const after = JSON.parse(fs.readFileSync(path.join(root, 'fonts/minecraft-ten-vietnamese/characters', name), 'utf8'));
  for (let column = 0; column < 4; column++) render(column % 2 ? after : before, norm([.35, column < 2 ? .65 : -.65, -1]), column * W, top + row * H);
}
let labels = `<svg width="${width}" height="${height}"><style>text{font-family:Arial;fill:white;font-size:13px}</style>`;
for (const [i, title] of ['Before / above', 'Optimized / above', 'Before / below', 'Optimized / below'].entries()) labels += `<text x="${i * W + W / 2}" y="20" text-anchor="middle">${title}</text>`;
for (const [i, name] of names.entries()) labels += `<text x="8" y="${top + i * H + 17}">${['Creeper breve dot','Creeper circumflex hook','ắ','ớ'][i]}</text>`;
labels += '</svg>';
const file = path.join(backup, 'angled-review.png');
await sharp(output, { raw: { width, height, channels: 4 } }).composite([{ input: Buffer.from(labels) }]).png().toFile(file);
console.log(file);
