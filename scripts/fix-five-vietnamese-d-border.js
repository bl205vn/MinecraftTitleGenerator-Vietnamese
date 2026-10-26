// Keep the white glyph and eight cubes; repair its 2px outline with an atlas mask.
// Dry run by default. --apply backs up every changed file, including user edits.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const font = path.join(root, 'fonts/minecraft-five-vietnamese');
const file = path.join(font, 'characters/đ.json');
const raw = fs.readFileSync(file), before = JSON.parse(raw), after = structuredClone(before);
const apply = process.argv.includes('--apply');
assert.ok(process.argv.slice(2).every(a => a === '--apply'));
assert.equal(before.elements.length, 8);
const atlasFile = path.join(font, 'textures/flat.png');
const atlasRaw = fs.readFileSync(atlasFile);
const atlas = await sharp(atlasRaw).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const color = (image, e, side, x, y) => {
  const [fx, fy] = e.from, [tx, ty] = e.to;
  const u = side === 'north' ? (tx - x) / (tx - fx) : (x - fx) / (tx - fx);
  const v = (ty - y) / (ty - fy), uv = e.faces[side].uv;
  const px = Math.floor((uv[0] + (uv[2] - uv[0]) * u) * 62.5 + 1e-8);
  const py = Math.floor((uv[1] + (uv[3] - uv[1]) * v) * 20 + 1e-8);
  const i = (py * 1000 + px) * 4;
  return image[i + 3] > 128 ? image[i] : -1;
};
const white = new Set();
for (const e of before.elements) {
  if (!e.to.every((v, i) => v > e.from[i]) || !e.faces.north) continue;
  for (let y = e.from[1]; y < e.to[1]; y++) for (let x = e.from[0]; x < e.to[0]; x++)
    if (color(atlas.data, e, 'north', x + .5, y + .5) === 255) white.add(`${x},${y}`);
}
assert.equal(white.size, 576);
const expanded = new Set();
for (const key of white) {
  const [x, y] = key.split(',').map(Number);
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) expanded.add(`${x + dx},${y + dy}`);
}
const origin = { x: 160, y: 240 }, width = 34, height = 34;
const rect = (x0, y0, x1, y1) => [x0 / 62.5, y0 / 20, x1 / 62.5, y1 / 20];
const { x: u, y: v } = origin;
const shell = after.elements[2];
assert.deepEqual(shell.from, [28, 34, 18]);
assert.deepEqual(shell.to, [-6, 0, -2]);
// Front/back use the same physical silhouette, with the reversed cube winding.
shell.faces.north.uv = rect(u, v, u + width, v + height);
shell.faces.south.uv = rect(u + width, v, u, v + height);
shell.faces.east.uv = rect(u, v, u + 1, v + height);
shell.faces.west.uv = rect(u + width - 1, v, u + width, v + height);
shell.faces.up.uv = rect(u + width, v + height, u, v + height - 1);
shell.faces.down.uv = rect(u + width, v, u, v + 1);
// Mask the inner end of the crossbar: opaque only at world Y 12..22.
after.elements[3].faces.east.uv = rect(u + 12, v + 10, u + 13, v + 24);
// The vertical stem ends at X20, so its inward border wall is at X22.
for (const index of [6, 7]) {
  assert.ok([22, 23].includes(after.elements[index].from[0]));
  after.elements[index].from[0] = 22;
}
assert.deepEqual(after.elements[0], before.elements[0], 'White geometry/UV changed');
assert.deepEqual(after.elements[4], before.elements[4], 'Cube 5 changed');
assert.deepEqual(after.elements[5], before.elements[5], 'Cube 6 changed');
const plans = [];
for (const name of ['flat.png', 'edition.png']) {
  const textureFile = path.join(font, 'textures', name), old = fs.readFileSync(textureFile);
  const image = await sharp(old).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual([image.info.width, image.info.height], [1000, 320]);
  const pixels = Buffer.from(image.data);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = ((v + y) * 1000 + u + x) * 4;
    assert.ok(image.data[i + 3] === 0 || (image.data[i] === 0 && image.data[i + 1] === 0 && image.data[i + 2] === 0), 'Atlas patch would overwrite artwork');
    pixels.set([0, 0, 0, expanded.has(`${x - 6},${33 - y}`) ? 255 : 0], i);
  }
  if (!pixels.equals(image.data)) plans.push({ file: textureFile, before: old,
    after: await sharp(pixels, { raw: image.info }).png().toBuffer() });
  if (name === 'flat.png') atlas.after = pixels;
}
function audit(model, pixels) {
  const result = {};
  for (const side of ['north', 'south']) {
    const black = new Set();
    for (const e of model.elements) {
      if (!e.faces[side] || (e.to[0] - e.from[0]) * (e.to[1] - e.from[1]) <= 0) continue;
      for (let y = Math.min(e.from[1], e.to[1]); y < Math.max(e.from[1], e.to[1]); y++)
        for (let x = Math.min(e.from[0], e.to[0]); x < Math.max(e.from[0], e.to[0]); x++)
          if (color(pixels, e, side, x + .5, y + .5) === 0) black.add(`${x},${y}`);
    }
    result[side] = { missing: [...expanded].filter(k => !white.has(k) && !black.has(k)).length,
      extra: [...black].filter(k => !expanded.has(k)).length };
  }
  return result;
}
const previousAudit = audit(before, atlas.data), nextAudit = audit(after, atlas.after);
for (const result of Object.values(nextAudit)) assert.deepEqual(result, { missing: 0, extra: 0 });
// Keep the original JSON formatting, including the user's restored cube names.
let index = -1, inElements = false;
const text = raw.toString('utf8').split(/(?<=\n)/).map(line => {
  if (/^\t"elements": \[/.test(line)) inElements = true;
  if (inElements && /^\t\t\{\s*$/.test(line)) index++;
  if (index < 0) return line;
  if ((index === 6 || index === 7) && /^\t\t\t"from":/.test(line))
    return line.replace(/\[[^\]]*\]/, `[${after.elements[index].from.join(', ')}]`);
  const side = line.match(/^\t\t\t\t"(north|south|east|west|up|down)":/);
  if (side && after.elements[index].faces[side[1]]) return line.replace(/"uv":\s*\[[^\]]*\]/,
    `"uv": [${after.elements[index].faces[side[1]].uv.join(', ')}]`);
  return line;
}).join('');
assert.deepEqual(JSON.parse(text), after);
if (!Buffer.from(text).equals(raw)) plans.push({ file, before: raw, after: Buffer.from(text) });
let backup;
if (apply && plans.length) {
  fs.mkdirSync(path.join(root, 'backups'), { recursive: true });
  backup = fs.mkdtempSync(path.join(root, 'backups/five-d-border-'));
  for (const p of plans) {
    assert.ok(fs.readFileSync(p.file).equals(p.before), 'Concurrent user edit');
    const dest = path.join(backup, path.relative(font, p.file));
    fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, p.before, { flag: 'wx' });
  }
  for (const p of plans) { assert.ok(fs.readFileSync(p.file).equals(p.before)); fs.writeFileSync(p.file, p.after); }
}
console.log(JSON.stringify({ apply, cubes: 8, whitePixelsUnchanged: white.size, previousAudit, nextAudit,
  patchPixels: [u, v, width, height], filesToWrite: plans.map(p => path.relative(root, p.file)), backup }, null, 2));
