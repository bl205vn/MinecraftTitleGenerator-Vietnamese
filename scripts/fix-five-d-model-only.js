// Repair only đ.json. Textures are read-only and checked by SHA-256 before/after.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'fonts/minecraft-five-vietnamese');
const file = path.join(dir, 'characters/đ.json');
const raw = fs.readFileSync(file), before = JSON.parse(raw), model = structuredClone(before);
const apply = process.argv.includes('--apply');
assert.ok(process.argv.slice(2).every(a => a === '--apply'));
assert.equal(model.elements.length, 8);
const textures = fs.readdirSync(path.join(dir, 'textures')).filter(f => f.endsWith('.png')).map(f => path.join(dir, 'textures', f));
const hash = f => createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const hashes = textures.map(f => [f, hash(f)]);
const { data } = await sharp(path.join(dir, 'textures/flat.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const px = (x0, y0, x1, y1) => [x0 / 62.5, y0 / 20, x1 / 62.5, y1 / 20];
const solid = [0, 10.3, .016, 10.35];
function sample(e, side, x, y) {
  const [fx, fy] = e.from, [tx, ty] = e.to;
  const u = side === 'north' ? (tx - x) / (tx - fx) : (x - fx) / (tx - fx), v = (ty - y) / (ty - fy);
  const a = e.faces[side].uv;
  const ix = Math.floor((a[0] + (a[2] - a[0]) * u) * 62.5 + 1e-8), iy = Math.floor((a[1] + (a[3] - a[1]) * v) * 20 + 1e-8);
  const i = (iy * 1000 + ix) * 4;
  return data[i + 3] > 128 ? data[i] : -1;
}
function projection(m, side) {
  const white = new Set(), black = new Set();
  for (const e of m.elements) {
    if (!e.faces[side] || (e.to[0] - e.from[0]) * (e.to[1] - e.from[1]) <= 0) continue;
    for (let y = Math.min(e.from[1], e.to[1]); y < Math.max(e.from[1], e.to[1]); y++)
      for (let x = Math.min(e.from[0], e.to[0]); x < Math.max(e.from[0], e.to[0]); x++) {
        const c = sample(e, side, x + .5, y + .5);
        if (c === 255) white.add(`${x},${y}`); else if (c === 0) black.add(`${x},${y}`);
      }
  }
  return { white, black };
}
const original = projection(before, 'north'), expected = new Set();
for (const key of original.white) {
  const [x, y] = key.split(',').map(Number);
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) expected.add(`${x + dx},${y + dy}`);
}
// Preserve the hollow letter's walls; the crossbar gets its own inverted shell.
model.elements[2].from[0] = 22;
delete model.elements[2].faces.west;
model.elements[2].faces.up.uv = [...solid];
model.elements[2].faces.down.uv = [...solid];
model.elements[3].to[0] = 12;
let strip;
for (let y = 206; y <= 313 && !strip; y++) for (let x = 0; x < 1000; x++) {
  let match = true;
  for (let j = 0; j < 7; j++) {
    const i = ((y + j) * 1000 + x) * 4;
    if (j === 6 ? !(data[i] === 0 && data[i + 3] === 255) : data[i + 3] !== 0) { match = false; break; }
  }
  if (match) { strip = { x, y }; break; }
}
assert.ok(strip, 'No existing strip for bottom wall segment');
model.elements[3].faces.east.uv = px(strip.x, strip.y, strip.x + 1, strip.y + 7);
model.elements[4] = { ...model.elements[4], from: [28, 22, 18], to: [6, 12, -2],
  faces: Object.fromEntries(['north', 'south', 'east', 'west', 'up', 'down'].map(s => [s, { uv: [...solid], texture: '#2' }])) };
// A solid cap across the crossbar cuts through the vertical stem at oblique
// angles. Reuse a 3-black / 5-clear / 3-black strip, scaled 2x along X:
// only X 6..12 and 22..28 are capped; X 12..22 stays transparent.
let capStrip;
for (let y = 206; y < 320 && !capStrip; y++) for (let x = 0; x <= 989; x++) {
  let match = true;
  for (let j = 0; j < 11; j++) {
    const i = (y * 1000 + x + j) * 4, black = j < 3 || j >= 8;
    if (black ? !(data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 0 && data[i + 3] === 255) : data[i + 3] !== 0) {
      match = false; break;
    }
  }
  if (match) { capStrip = { x, y }; break; }
}
assert.ok(capStrip, 'No existing two-ended cap strip');
for (const side of ['up', 'down']) model.elements[4].faces[side].uv = px(capStrip.x + 11, capStrip.y, capStrip.x, capStrip.y + 1);
// Sample the actual 3D UV mapping across depth, not just the front silhouette.
const crossbar = model.elements[4];
let capSamples = 0;
for (const texture of textures) {
  const { data: image } = await sharp(texture).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (const side of ['up', 'down']) for (let x = 6.25; x < 28; x += .5) for (let z = -1.75; z < 18; z += .5) {
    const u = (x - crossbar.from[0]) / (crossbar.to[0] - crossbar.from[0]);
    const v = side === 'up' ? (z - crossbar.from[2]) / (crossbar.to[2] - crossbar.from[2]) : (crossbar.to[2] - z) / (crossbar.to[2] - crossbar.from[2]);
    const a = crossbar.faces[side].uv;
    const ix = Math.floor((a[0] + (a[2] - a[0]) * u) * 62.5 + 1e-8), iy = Math.floor((a[1] + (a[3] - a[1]) * v) * 20 + 1e-8);
    const i = (iy * 1000 + ix) * 4;
    assert.equal(image[i + 3], x < 12 || x >= 22 ? 255 : 0, 'Crossbar cap crosses stem or leaves disconnected ends');
    if (image[i + 3]) assert.deepEqual([...image.subarray(i, i + 3)], [0, 0, 0]);
    capSamples++;
  }
}
model.elements[5].faces = { east: model.elements[5].faces.east };
for (const i of [6, 7]) {
  model.elements[i].from[0] = 22;
  model.elements[i].faces = { west: model.elements[i].faces.west };
}
// Find a matching EXISTING mask. Do not draw a new one.
const withoutShell = structuredClone(model);
delete withoutShell.elements[2].faces.north;
const supplied = projection(withoutShell, 'north').black;
let best, bestScore = Infinity;
for (let y = 206; y <= 224; y++) for (let x = 0; x < 250; x++) {
  let score = 0;
  const uv = px(x + 14, y, x, y + 17);
  model.elements[2].faces.north.uv = uv;
  for (let wy = 0; wy < 34 && score < bestScore; wy++) for (let wx = -6; wx < 22; wx++) {
    const key = `${wx},${wy}`;
    if (original.white.has(key)) continue;
    const c = sample(model.elements[2], 'north', wx + .5, wy + .5);
    const opaque = c >= 0;
    if ((opaque && c !== 0) || (opaque && !expected.has(key)) || (!opaque && expected.has(key) && !supplied.has(key))) score++;
  }
  if (score < bestScore) { bestScore = score; best = { x, y }; }
}
assert.equal(bestScore, 0, `No exact mask found; best = ${JSON.stringify({ best, bestScore })}`);
model.elements[2].faces.north.uv = px(best.x + 14, best.y, best.x, best.y + 17);
model.elements[2].faces.south.uv = px(best.x, best.y, best.x + 14, best.y + 17);
function audit(m, side) {
  const { white, black } = projection(m, side);
  assert.deepEqual(white, original.white);
  return { missing: [...expected].filter(k => !white.has(k) && !black.has(k)).length,
    extra: [...black].filter(k => !expected.has(k)).length };
}
const report = { before: { north: audit(before, 'north'), south: audit(before, 'south') },
  after: { north: audit(model, 'north'), south: audit(model, 'south') } };
for (const result of Object.values(report.after)) assert.deepEqual(result, { missing: 0, extra: 0 });
assert.deepEqual(model.elements[0], before.elements[0]);
let backup;
if (apply) {
  assert.ok(fs.readFileSync(file).equals(raw), 'Concurrent model change');
  fs.mkdirSync(path.join(root, 'backups'), { recursive: true });
  backup = fs.mkdtempSync(path.join(root, 'backups/five-d-uv-only-'));
  fs.writeFileSync(path.join(backup, 'đ.json'), raw);
  const output = JSON.stringify(model, null, '\t').replace(/\[\s+(-?[\d.]+(?:,\s+-?[\d.]+)*)\s+\]/g,
    (_, numbers) => `[${numbers.replace(/,\s+/g, ', ')}]`)
    .replace(/"(north|south|east|west|up|down)": \{\s+"uv": (\[[^\]]+\]),\s+"texture": ("[^"]+")\s+\}/g,
      '"$1": {"uv": $2, "texture": $3}') + '\n';
  fs.writeFileSync(file, output);
}
for (const [f, originalHash] of hashes) assert.equal(hash(f), originalHash, 'Texture was modified');
console.log(JSON.stringify({ apply, cubes: model.elements.length, whiteUnchanged: true,
  existingMaskPixels: best, existingWallStripPixels: strip, existingCapStripPixels: capStrip,
  crossbarCapSamples: capSamples, textureHashesUnchanged: true, ...report, backup }, null, 2));
