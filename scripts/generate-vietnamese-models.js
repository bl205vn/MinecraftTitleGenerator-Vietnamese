// Read-only by default. --apply creates new models and a backup/report.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const font = path.join(root, 'fonts/minecraft-ten-vietnamese');
const characters = path.join(font, 'characters');
const referenceDir = path.join(font, 'Các ký tự tiếng việt');
const apply = process.argv.includes('--apply');
assert.ok(process.argv.slice(2).every(a => a === '--apply'));
const snapshots = new Map();
const digest = raw => createHash('sha256').update(raw).digest('hex');
function read(file) { const raw = fs.readFileSync(file); snapshots.set(file, raw); return raw; }
const table = read(path.join(referenceDir, 'Vị trí chữ.txt')).toString('utf8');
const reference = await sharp(read(path.join(referenceDir, 'Danh sách ký tự có dấu tiếng việt.png')))
  .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const atlas = await sharp(read(path.join(font, 'textures/flat.png')))
  .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
assert.equal(atlas.info.width, 1000); assert.equal(atlas.info.height, 320);
const originalFiles = fs.readdirSync(characters).filter(f => f.endsWith('.json'));
for (const filename of originalFiles) read(path.join(characters, filename));
const clean = n => Math.round(n * 1e10) / 1e10;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
function pixel(image, x, y) {
  x = Math.floor(x); y = Math.floor(y);
  if (x < 0 || y < 0 || x >= image.info.width || y >= image.info.height) return [0, 0, 0, 0];
  const p = (y * image.info.width + x) * 4;
  return image.data.subarray(p, p + 4);
}
const isInk = (x, y) => { const p = pixel(reference, x, y); return p[3] > 128 && p[0] < 128; };
function bounds(elements) {
  return [0, 1, 2].map(a => {
    const values = elements.flatMap(e => [e.from[a], e.to[a]]);
    return [Math.min(...values), Math.max(...values)];
  });
}
function shift(elements, dx, dy, dz = 0) {
  const delta = [dx, dy, dz];
  for (const e of elements) {
    for (const key of ['from', 'to']) e[key] = e[key].map((v, a) => clean(v + delta[a]));
    if (e.rotation) e.rotation.origin = e.rotation.origin.map((v, a) => clean(v + delta[a]));
  }
}
function mirror(elements) {
  for (const e of elements) {
    [e.from[0], e.to[0]] = [16 - e.to[0], 16 - e.from[0]];
    if (e.rotation) e.rotation.origin[0] = 16 - e.rotation.origin[0];
    const faces = {};
    for (const [side, original] of Object.entries(e.faces)) {
      const f = structuredClone(original);
      [f.uv[0], f.uv[2]] = [f.uv[2], f.uv[0]];
      faces[side === 'east' ? 'west' : side === 'west' ? 'east' : side] = f;
    }
    e.faces = faces;
  }
}
function sampleNorth(e, x, y) {
  const uv = e.faces.north.uv;
  const u = uv[0] + (uv[2] - uv[0]) * (e.to[0] - x) / (e.to[0] - e.from[0]);
  const v = uv[1] + (uv[3] - uv[1]) * (e.to[1] - y) / (e.to[1] - e.from[1]);
  const p = pixel(atlas, u * 62.5, v * 20);
  return p[3] > 128 && p[0] > 200;
}
function whiteCells(elements) {
  const result = [];
  for (const e of elements) {
    if (!e.faces.north || !e.to.every((v, a) => v > e.from[a])) continue;
    const w = e.to[0] - e.from[0], h = e.to[1] - e.from[1];
    assert.equal(w, Math.round(w)); assert.equal(h, Math.round(h));
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const x = e.from[0] + i, y = e.from[1] + j;
      if (sampleNorth(e, x + .5, y + .5)) result.push([x, y]);
    }
  }
  assert.ok(result.length);
  return result;
}
const cellBounds = cells => [[Math.min(...cells.map(p => p[0])), Math.max(...cells.map(p => p[0])) + 1],
  [Math.min(...cells.map(p => p[1])), Math.max(...cells.map(p => p[1])) + 1]];
const templateCache = new Map();
function template(name) {
  if (!templateCache.has(name)) {
    const source = name;
    const doc = JSON.parse(snapshots.get(path.join(characters, source + '.json')).toString('utf8'));
    assert.deepEqual(doc.texture_size, [1000, 320]);
    const elements = structuredClone(doc.elements);
    assert.ok(elements.every(e => !e.rotation?.angle), 'Rotated templates need explicit support');
    for (const [i, e] of elements.entries()) {
      e.name = `${name}_${e.name || 'cube' + (i + 1)}`;
      for (const face of Object.values(e.faces)) if (face.texture != null) face.texture = '#0';
    }
    templateCache.set(name, elements);
  }
  return structuredClone(templateCache.get(name));
}
function referenceParts(entry) {
  const todo = new Set(), width = reference.info.width;
  for (let y = entry.y; y < entry.y + entry.h; y++)
    for (let x = entry.x; x < entry.x + entry.w; x++) if (isInk(x, y)) todo.add(y * width + x);
  const components = [];
  while (todo.size) {
    const start = todo.values().next().value, queue = [start], points = [];
    todo.delete(start);
    for (let i = 0; i < queue.length; i++) {
      const p = queue[i], x = p % width, y = Math.floor(p / width); points.push([x, y]);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const n = (y + dy) * width + x + dx;
        if (todo.delete(n)) queue.push(n);
      }
    }
    const b = cellBounds(points);
    components.push({ x: b[0][0], y: b[1][0], w: b[0][1] - b[0][0], h: b[1][1] - b[1][0], pixels: points.length });
  }
  const base = components.reduce((a, b) => a.pixels > b.pixels ? a : b);
  return { base, others: components.filter(c => c !== base).sort((a, b) => a.y - b.y) };
}
// Two white pixel cells must have at least two world units of clearance.
// Borders may overlap each other; this prevents either 2px border entering the other white shape.
function tooClose(first, second) {
  const a = cellBounds(first), b = cellBounds(second);
  if (a[0][1] + 2 <= b[0][0] || b[0][1] + 2 <= a[0][0] || a[1][1] + 2 <= b[1][0] || b[1][1] + 2 <= a[1][0]) return false;
  for (const [x, y] of first) for (const [u, v] of second)
    if (Math.abs(x - u) < 3 - 1e-8 && Math.abs(y - v) < 3 - 1e-8) return true;
  return false;
}
let group = -1;
const entries = [];
for (const line of table.split(/\r?\n/)) {
  if (/^\d+\./.test(line)) group++;
  const m = line.match(/^\s*-\s*(\S):\s*(\d+),\s*(\d+)\s+(\d+)x(\d+)/);
  if (m) entries.push({ char: m[1].normalize('NFC'), group, x: +m[2], y: +m[3], w: +m[4], h: +m[5] });
}
assert.equal(entries.length, 83); assert.equal(new Set(entries.map(e => e.char)).size, 83);
const toneNames = { '\u0300': 'grave', '\u0301': 'acute', '\u0309': 'hookabove', '\u0303': 'tilde', '\u0323': 'dotbelow' };
const generated = [], existing = [], adjustments = [];
for (const entry of entries) {
  const nfd = entry.char.normalize('NFD');
  const baseName = entry.group === 0 ? 'creeper' : nfd.includes('\u031b') ? (entry.group === 4 ? 'ơ' : 'ư') : nfd[0];
  const structural = nfd.includes('\u0302') ? '^' : nfd.includes('\u0306') ? 'breve' : null;
  const tone = Object.entries(toneNames).find(([code]) => nfd.includes(code))?.[1] ?? null;
  if (!structural && !tone) { existing.push(entry.char + '.json'); continue; }
  const filename = entry.group === 0 ? ['creeper', structural === '^' ? 'circumflex' : structural, tone].filter(Boolean).join('_') + '.json' : entry.char + '.json';
  const referenceLayout = referenceParts(entry);
  assert.equal(referenceLayout.others.length, Number(Boolean(structural)) + Number(Boolean(tone)), `Unexpected components in ${entry.char}`);
  const baseElements = template(baseName), baseCells = whiteCells(baseElements), wb = cellBounds(baseCells);
  const parts = [{ name: baseName, elements: baseElements, cells: baseCells }];
  const refs = [...referenceLayout.others];
  const dotRef = tone === 'dotbelow' ? refs.pop() : null;
  const structuralRef = structural ? refs.pop() : null;
  const toneRef = tone && tone !== 'dotbelow' ? refs.pop() : dotRef;
  assert.equal(refs.length, 0);
  for (const [name, ref] of [[structural, structuralRef], [tone, toneRef]]) {
    if (!name) continue;
    const elements = template(name), cells = whiteCells(elements), b = cellBounds(cells);
    const desiredCenter = wb[0][1] - (ref.x + ref.w / 2 - referenceLayout.base.x);
    const dx = desiredCenter - (b[0][0] + b[0][1]) / 2;
    // Bottom-align to preserve the visual gap even when the template is taller than the reference.
    const dy = wb[1][1] - (ref.y + ref.h - referenceLayout.base.y) - b[1][0];
    shift(elements, dx, dy);
    let moved = cells.map(([x, y]) => [x + dx, y + dy]), extra = 0;
    const direction = name === 'dotbelow' ? -1 : 1;
    // On horned letters, moving slightly away from the horn can preserve a lower accent.
    const candidates = [];
    for (let up = 0; up <= 24; up++) for (let away = 0; away <= (baseName === 'ơ' || baseName === 'ư' ? 8 : 0); away++)
      candidates.push({ up, away, cost: up * 1.5 + away });
    candidates.sort((a, b) => a.cost - b.cost || a.up - b.up || a.away - b.away);
    const placement = candidates.find(c => {
      const test = moved.map(([x, y]) => [x + c.away, y + direction * c.up]);
      return !parts.some(p => tooClose(test, p.cells));
    });
    assert.ok(placement, `Cannot place ${name} on ${entry.char}`);
    extra = placement.up;
    shift(elements, placement.away, direction * extra);
    moved = moved.map(([x, y]) => [x + placement.away, y + direction * extra]);
    if (extra || placement.away) adjustments.push({ char: entry.char, part: name, extraX: placement.away, extraY: extra * direction });
    parts.push({ name, elements, cells: moved });
  }
  const elements = parts.flatMap(p => p.elements), before = bounds(elements);
  const centerShift = [8 - (before[0][0] + before[0][1]) / 2, 0, 8 - (before[2][0] + before[2][1]) / 2];
  shift(elements, ...centerShift);
  for (const part of parts) part.cells = part.cells.map(([x, y]) => [x + centerShift[0], y]);
  for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) assert.ok(!tooClose(parts[i].cells, parts[j].cells));
  const bb = bounds(elements); near((bb[0][0] + bb[0][1]) / 2, 8); near((bb[2][0] + bb[2][1]) / 2, 8);
  near(Math.min(...baseCells.map(p => p[1])), 2);
  const model = { format_version: '26.3', credit: 'Ewan Howell; Vietnamese adaptations by bl205vn', texture_size: [1000, 320],
    textures: { '0': 'minecraft-ten-vietnamese:flat', particle: 'minecraft-ten-vietnamese:flat' }, elements };
  generated.push({ char: entry.char, filename, parts, model, bounds: bb, centerShift });
}
assert.equal(generated.length, 81); assert.equal(new Set(generated.map(g => g.filename.toLowerCase())).size, 81);

// Check opaque border side faces against the other components' extruded white shapes.
// Negative border shells may overlap each other; crossing another white part is rejected.
function sideFaceOpaque(e, side, x, y, z) {
  const uv = e.faces[side].uv, [fx, fy, fz] = e.from, [tx, ty, tz] = e.to;
  let u, v;
  if (side === 'east' || side === 'west') {
    u = side === 'east' ? (tz - z) / (tz - fz) : (z - fz) / (tz - fz);
    v = (ty - y) / (ty - fy);
  } else {
    u = (x - fx) / (tx - fx);
    v = side === 'up' ? (z - fz) / (tz - fz) : (tz - z) / (tz - fz);
  }
  const p = pixel(atlas, (uv[0] + (uv[2] - uv[0]) * u) * 62.5, (uv[1] + (uv[3] - uv[1]) * v) * 20);
  return p[3] > 128;
}
const occlusions = [];
for (const glyph of generated) for (const part of glyph.parts) {
  const whiteElements = new Set(part.elements.filter(e => e.faces.north && e.to.every((v, a) => v > e.from[a])));
  for (const e of part.elements) {
    if (whiteElements.has(e)) continue;
    for (const side of ['east', 'west', 'up', 'down']) {
      if (!e.faces[side]) continue;
      const vertical = side === 'east' || side === 'west', axis = vertical ? 0 : 1;
      const plane = side === 'east' || side === 'up' ? e.to[axis] : e.from[axis];
      const lo = Math.min(e.from[1 - axis], e.to[1 - axis]), hi = Math.max(e.from[1 - axis], e.to[1 - axis]);
      const zlo = Math.max(Math.min(e.from[2], e.to[2]), -3), zhi = Math.min(Math.max(e.from[2], e.to[2]), 19);
      if (zhi <= zlo) continue;
      for (const other of glyph.parts) {
        if (other === part) continue;
        const inside = (x, y) => other.cells.some(([u, v]) => x >= u && x < u + 1 && y >= v && y < v + 1);
        const samples = new Set();
        for (const cell of other.cells) {
          const tangent = cell[1 - axis] + .5;
          if (tangent < lo || tangent > hi) continue;
          const x = vertical ? plane : tangent, y = vertical ? tangent : plane;
          if (inside(x - (vertical ? 1e-5 : 0), y - (vertical ? 0 : 1e-5)) &&
              inside(x + (vertical ? 1e-5 : 0), y + (vertical ? 0 : 1e-5))) samples.add(tangent);
        }
        for (const tangent of samples) for (let k = 0; k < 5; k++) {
          const z = zlo + (zhi - zlo) * (k + .5) / 5;
          if (sideFaceOpaque(e, side, vertical ? plane : tangent, vertical ? tangent : plane, z)) {
            occlusions.push({ char: glyph.char, border: part.name, white: other.name, side, plane, tangent }); break;
          }
        }
      }
    }
  }
}
assert.equal(occlusions.length, 0, `Border enters white geometry: ${JSON.stringify(occlusions.slice(0, 12))}`);
const summary = { generated: generated.length, lowercase: generated.filter(g => !g.filename.startsWith('creeper_')).length,
  creeper: generated.filter(g => g.filename.startsWith('creeper_')).length, reusedExisting: existing,
  adjustments, borderOcclusions: occlusions.length, minCubes: Math.min(...generated.map(g => g.model.elements.length)), maxCubes: Math.max(...generated.map(g => g.model.elements.length)),
  files: generated.map(g => ({ char: g.char, filename: g.filename, cubes: g.model.elements.length, bounds: g.bounds })) };
summary.existingOutputsVerified = 0;
for (const glyph of generated) {
  const file = path.join(characters, glyph.filename);
  if (!fs.existsSync(file)) continue;
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), glyph.model, `Existing output differs: ${glyph.filename}`);
  summary.existingOutputsVerified++;
}

// Draw a front orthographic technical preview from the actual face UVs, not the reference image.
export function previewSvg() {
  const cols = 9, cw = 132, ch = 126, rows = Math.ceil(generated.length / cols);
  let out = `<svg xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" width="${cols * cw}" height="${rows * ch}" viewBox="0 0 ${cols * cw} ${rows * ch}"><rect width="100%" height="100%" fill="#30343a"/>`;
  for (const [index, glyph] of generated.entries()) {
    const ox = index % cols * cw, oy = Math.floor(index / cols) * ch;
    out += `<text x="${ox + cw / 2}" y="${oy + 16}" text-anchor="middle" font-family="Arial" font-size="13" fill="white">${glyph.char}${glyph.filename.startsWith('creeper_') ? ' (C)' : ''}</text>`;
    const es = glyph.model.elements.filter(e => e.faces.north).sort((a, b) => b.from[2] - a.from[2]);
    for (const e of es) {
      const [xmin, xmax] = [Math.min(e.from[0], e.to[0]), Math.max(e.from[0], e.to[0])];
      const [ymin, ymax] = [Math.min(e.from[1], e.to[1]), Math.max(e.from[1], e.to[1])];
      const uv = e.faces.north.uv;
      for (let y = ymin; y < ymax - 1e-7; y++) for (let x = xmin; x < xmax - 1e-7; x++) {
        const w = Math.min(1, xmax - x), h = Math.min(1, ymax - y);
        const u = uv[0] + (uv[2] - uv[0]) * (e.to[0] - x - w / 2) / (e.to[0] - e.from[0]);
        const v = uv[1] + (uv[3] - uv[1]) * (e.to[1] - y - h / 2) / (e.to[1] - e.from[1]);
        const p = pixel(atlas, u * 62.5, v * 20); if (!p[3]) continue;
        out += `<rect x="${clean(ox + cw / 2 + (8 - x - w) * 1.1)}" y="${clean(oy + 104 - (y + h) * 1.1)}" width="${clean(w * 1.1 + .005)}" height="${clean(h * 1.1 + .005)}" fill="rgb(${p[0]},${p[1]},${p[2]})"/>`;
      }
    }
  }
  return out + '</svg>';
}
if (apply) {
  for (const [file, raw] of snapshots) assert.equal(digest(fs.readFileSync(file)), digest(raw), `Input changed: ${file}`);
  for (const g of generated) assert.ok(!fs.existsSync(path.join(characters, g.filename)), `Refusing to overwrite ${g.filename}`);
  fs.mkdirSync(path.join(root, 'backups'), { recursive: true });
  const backup = fs.mkdtempSync(path.join(root, 'backups', 'vietnamese-compose-'));
  fs.mkdirSync(path.join(backup, 'characters'));
  for (const filename of originalFiles) fs.writeFileSync(path.join(backup, 'characters', filename), snapshots.get(path.join(characters, filename)), { flag: 'wx' });
  fs.writeFileSync(path.join(backup, 'flat.png'), snapshots.get(path.join(font, 'textures/flat.png')));
  fs.writeFileSync(path.join(backup, 'Vị trí chữ.txt'), table);
  const reportDir = fs.mkdtempSync(path.join(root, 'backups', 'vietnamese-compose-review-'));
  summary.backup = backup; summary.report = reportDir;
  fs.writeFileSync(path.join(reportDir, 'preview.svg'), previewSvg());
  fs.writeFileSync(path.join(reportDir, 'manifest.json'), JSON.stringify(summary, null, 2) + '\n');
  for (const g of generated) {
    const output = JSON.stringify(g.model, null, '\t') + '\n';
    fs.writeFileSync(path.join(characters, g.filename), output, { flag: 'wx' });
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(characters, g.filename), 'utf8')), g.model);
  }
  for (const [file, raw] of snapshots) assert.equal(digest(fs.readFileSync(file)), digest(raw), `Original changed: ${file}`);
  const png = await sharp(Buffer.from(previewSvg())).png().toBuffer();
  fs.writeFileSync(path.join(reportDir, 'preview.png'), png);
}
console.log(JSON.stringify({ ...summary, files: undefined }, null, 2));
