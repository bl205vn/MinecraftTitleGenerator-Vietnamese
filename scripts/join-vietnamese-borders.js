// Inspect by default; --apply backs up and joins only existing border contacts.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const font = path.join(root, 'fonts/minecraft-ten-vietnamese');
const chars = path.join(font, 'characters');
const apply = process.argv.includes('--apply');
assert.ok(process.argv.slice(2).every(a => a === '--apply'));
const hash = b => createHash('sha256').update(b).digest('hex');
const round = n => Math.round(n * 1e10) / 1e10;
const EPS = 1e-7;
const atlasRaw = fs.readFileSync(path.join(font, 'textures/flat.png'));
const atlas = await sharp(atlasRaw).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
assert.equal(atlas.info.width, 1000); assert.equal(atlas.info.height, 320);
function pixel(x, y) {
  x = Math.floor(x); y = Math.floor(y);
  if (x < 0 || y < 0 || x >= 1000 || y >= 320) return [0, 0, 0, 0];
  const p = (y * 1000 + x) * 4;
  return atlas.data.subarray(p, p + 4);
}
const black = pixel(0, 280);
assert.deepEqual([...black], [0, 0, 0, 255]);
const intersect = (a, b) => {
  const r = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
  return r[2] - r[0] > EPS && r[3] - r[1] > EPS ? r : null;
};
const area = r => (r[2] - r[0]) * (r[3] - r[1]);
function subtractOne(r, cut) {
  const i = intersect(r, cut); if (!i) return [r];
  return [[r[0], r[1], i[0], r[3]], [i[2], r[1], r[2], r[3]],
    [i[0], r[1], i[2], i[1]], [i[0], i[3], i[2], r[3]]]
    .filter(p => p[2] - p[0] > EPS && p[3] - p[1] > EPS);
}
const subtract = (rects, cuts) => cuts.reduce((rs, c) => rs.flatMap(r => subtractOne(r, c)), rects);
function merge(rects) {
  const out = [];
  for (const r of rects) out.push(...subtract([r], out));
  let again = true;
  while (again) {
    again = false;
    outer: for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
      const a = out[i], b = out[j];
      const horizontal = Math.abs(a[1] - b[1]) < EPS && Math.abs(a[3] - b[3]) < EPS &&
        (Math.abs(a[2] - b[0]) < EPS || Math.abs(b[2] - a[0]) < EPS);
      const vertical = Math.abs(a[0] - b[0]) < EPS && Math.abs(a[2] - b[2]) < EPS &&
        (Math.abs(a[3] - b[1]) < EPS || Math.abs(b[3] - a[1]) < EPS);
      if (horizontal || vertical) {
        out[i] = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
        out.splice(j, 1); again = true; break outer;
      }
    }
  }
  return out;
}
const totalArea = rs => rs.reduce((s, r) => s + area(r), 0);
function formatModel(model, original) {
  const text = JSON.stringify(model, null, '\t')
    .replace(/\[\n\s+([-0-9.,\s]+)\n\s+\]/g, (_, values) => '[' + values.trim().split(/\s*,\s*/).join(', ') + ']')
    .replace(/\{\n\s+"uv": (\[[^\n]+\]),\n\s+"texture": ("[^"]+")\n\s+\}/g, '{"uv": $1, "texture": $2}')
    .replace(/\{\n\s+"angle": ([^,]+),\n\s+"axis": ("[^"]+"),\n\s+"origin": (\[[^\n]+\])\n\s+\}/g, '{"angle": $1, "axis": $2, "origin": $3}');
  return (text + '\n').replace(/\n/g, original.includes('\r\n') ? '\r\n' : '\n');
}
const definitions = { north: [2, 'from', -1], south: [2, 'to', 1], east: [0, 'to', 1],
  west: [0, 'from', -1], up: [1, 'to', 1], down: [1, 'from', -1] };
function faceInfo(e, side) {
  const [axis, end, sign] = definitions[side], axes = [0, 1, 2].filter(a => a !== axis);
  return { axis, axes, plane: e[end][axis], normal: sign * Math.sign((e.to[axes[0]] - e.from[axes[0]]) * (e.to[axes[1]] - e.from[axes[1]])),
    rect: [Math.min(e.from[axes[0]], e.to[axes[0]]), Math.min(e.from[axes[1]], e.to[axes[1]]),
      Math.max(e.from[axes[0]], e.to[axes[0]]), Math.max(e.from[axes[1]], e.to[axes[1]])] };
}
function uvAt(e, side, p) {
  const [fx, fy, fz] = e.from, [tx, ty, tz] = e.to, [x, y, z] = p;
  let u, v;
  if (side === 'north' || side === 'south') { u = side === 'north' ? (tx - x) / (tx - fx) : (x - fx) / (tx - fx); v = (ty - y) / (ty - fy); }
  else if (side === 'east' || side === 'west') { u = side === 'east' ? (tz - z) / (tz - fz) : (z - fz) / (tz - fz); v = (ty - y) / (ty - fy); }
  else { u = (x - fx) / (tx - fx); v = side === 'up' ? (z - fz) / (tz - fz) : (tz - z) / (tz - fz); }
  const uv = e.faces[side].uv;
  return [uv[0] + (uv[2] - uv[0]) * u, uv[1] + (uv[3] - uv[1]) * v];
}
function opaqueRects(e, side) {
  const info = faceInfo(e, side), { axes, rect } = info;
  const uvAxes = side === 'north' || side === 'south' ? [0, 1] : side === 'east' || side === 'west' ? [2, 1] : [0, 2];
  const breaks = axes.map((a, i) => {
    const [lo, hi] = [rect[i], rect[i + 2]], p = e.from.map((v, k) => (v + e.to[k]) / 2);
    p[info.axis] = info.plane; p[a] = lo;
    const which = uvAxes.indexOf(a), scale = which ? 20 : 62.5, first = uvAt(e, side, p)[which] * scale;
    p[a] = hi; const last = uvAt(e, side, p)[which] * scale, list = [lo, hi];
    if (Math.abs(last - first) > EPS) for (let n = Math.ceil(Math.min(first, last)); n <= Math.floor(Math.max(first, last)); n++) {
      const c = lo + (n - first) / (last - first) * (hi - lo);
      if (c > lo + EPS && c < hi - EPS) list.push(round(c));
    }
    return [...new Set(list)].sort((a, b) => a - b);
  });
  const result = [];
  for (let i = 0; i + 1 < breaks[0].length; i++) for (let j = 0; j + 1 < breaks[1].length; j++) {
    const r = [breaks[0][i], breaks[1][j], breaks[0][i + 1], breaks[1][j + 1]], p = [0, 0, 0];
    p[info.axis] = info.plane; p[axes[0]] = (r[0] + r[2]) / 2; p[axes[1]] = (r[1] + r[3]) / 2;
    const uv = uvAt(e, side, p), rgba = pixel(uv[0] * 62.5, uv[1] * 20);
    if (rgba[3] > 128) { assert.ok(rgba[0] < 8 && rgba[1] < 8 && rgba[2] < 8, 'Nonblack border face'); result.push(r); }
  }
  return merge(result);
}
const contains = (rs, x, y) => rs.some(r => x > r[0] - EPS && x < r[2] - EPS && y > r[1] - EPS && y < r[3] - EPS);
const whiteElement = e => e.to.every((v, a) => v > e.from[a]) && !!e.faces.north;
const partName = e => e.name.split('_cube')[0];

// Existing black/transparent atlas runs can often clip a whole face without adding cubes.
const profiles = [[], []];
for (let orientation = 0; orientation < 2; orientation++) {
  const fixedLimit = orientation ? 160 : 40, variableLo = orientation ? 280 : 0, variableHi = orientation ? 320 : 160;
  for (let f = 0; f < fixedLimit; f++) {
    const fixed = orientation ? f : 280 + f, runs = [];
    for (let v = variableLo; v < variableHi; v++) {
      const p = orientation ? pixel(fixed, v) : pixel(v, fixed);
      const state = p[3] < 128 ? 0 : p[0] < 8 && p[1] < 8 && p[2] < 8 ? 1 : 2;
      if (runs.length && runs.at(-1).state === state) runs.at(-1).end = v + 1;
      else runs.push({ start: v, end: v + 1, state });
    }
    profiles[orientation].push({ fixed, runs });
  }
}
function atlasMask(e, side, desired) {
  const info = faceInfo(e, side), { rect, axes } = info;
  for (let along = 0; along < 2; along++) {
    const other = 1 - along, edges = [...new Set([rect[along], rect[along + 2], ...desired.flatMap(r => [r[along], r[along + 2]])])].sort((a, b) => a - b);
    const runs = []; let valid = true;
    for (let i = 0; i + 1 < edges.length; i++) {
      const c = (edges[i] + edges[i + 1]) / 2, segments = desired.filter(r => c > r[along] && c < r[along + 2]);
      const length = segments.reduce((n, r) => n + r[other + 2] - r[other], 0), full = rect[other + 2] - rect[other];
      if (length > EPS && Math.abs(length - full) > EPS) { valid = false; break; }
      const state = length > EPS ? 1 : 0;
      if (runs.length && runs.at(-1).state === state) runs.at(-1).end = edges[i + 1];
      else runs.push({ start: edges[i], end: edges[i + 1], state });
    }
    if (!valid || runs.length < 2) continue;
    const uvAxes = side === 'north' || side === 'south' ? [0, 1] : side === 'east' || side === 'west' ? [2, 1] : [0, 2];
    const which = uvAxes.indexOf(axes[along]), scale = which ? 20 : 62.5;
    for (const profile of profiles[which]) for (let offset = 0; offset + runs.length <= profile.runs.length; offset++) {
      const src = profile.runs.slice(offset, offset + runs.length);
      if (!src.every((r, i) => r.state === runs[i].state)) continue;
      const ratios = runs.length > 2 ? [(src[1].end - src[0].end) / (runs[1].end - runs[0].end)] : [2, 1, .5, .25, .125, .0625];
      for (const ratio of ratios) {
        const start = src[0].end - ratio * (runs[0].end - rect[along]);
        const end = start + ratio * (rect[along + 2] - rect[along]);
        if (start < src[0].start - EPS || end > src.at(-1).end + EPS) continue;
        if (!runs.slice(0, -1).every((r, i) => Math.abs(start + ratio * (r.end - rect[along]) - src[i].end) < 1e-7)) continue;
        // Map the selected atlas profile to the original face parameter direction.
        const p0 = e.from.map((v, a) => (v + e.to[a]) / 2), p1 = [...p0]; p0[info.axis] = p1[info.axis] = info.plane;
        p0[axes[along]] = rect[along]; p1[axes[along]] = rect[along + 2];
        const oldDelta = e.faces[side].uv[which + 2] - e.faces[side].uv[which];
        const forward = (uvAt(e, side, p1)[which] - uvAt(e, side, p0)[which]) / oldDelta > 0;
        const uv = which === 0 ? [forward ? start / scale : end / scale, profile.fixed / 20,
          forward ? end / scale : start / scale, (profile.fixed + 1) / 20] :
          [profile.fixed / 62.5, forward ? start / scale : end / scale, (profile.fixed + 1) / 62.5, forward ? end / scale : start / scale];
        const rounded = uv.map(v => Math.round(v * 1e5) / 1e5);
        // Use only mappings which remain exact when Blockbench saves five UV decimals.
        const newStart = (forward ? rounded[which] : rounded[which + 2]) * scale;
        const newEnd = (forward ? rounded[which + 2] : rounded[which]) * scale;
        if (!runs.slice(0, -1).every((r, i) => Math.abs(rect[along] + (src[i].end - newStart) / (newEnd - newStart) * (rect[along + 2] - rect[along]) - r.end) < 1e-7)) continue;
        return rounded;
      }
    }
  }
  return null;
}

const table = fs.readFileSync(path.join(font, 'Các ký tự tiếng việt/Vị trí chữ.txt'), 'utf8');
const tones = { '\u0300': 'grave', '\u0301': 'acute', '\u0309': 'hookabove', '\u0303': 'tilde', '\u0323': 'dotbelow' };
let group = -1;
const targets = [];
for (const line of table.split(/\r?\n/)) {
  if (/^\d+\./.test(line)) group++;
  const match = line.match(/^\s*-\s*(\S):/); if (!match) continue;
  const char = match[1], nfd = char.normalize('NFD'), structural = nfd.includes('\u0302') ? 'circumflex' : nfd.includes('\u0306') ? 'breve' : null;
  const tone = Object.entries(tones).find(([code]) => nfd.includes(code))?.[1];
  if (!structural && !tone) continue;
  const filename = group === 0 ? ['creeper', structural, tone].filter(Boolean).join('_') + '.json' : char + '.json';
  targets.push({ char, filename });
}
assert.equal(targets.length, 81);
const plans = [], records = [], skipped = [];
for (const target of targets) {
  const file = path.join(chars, target.filename), raw = fs.readFileSync(file, 'utf8'), old = JSON.parse(raw), model = structuredClone(old);
  assert.ok(old.elements.every(e => !e.rotation?.angle), 'Rotated cubes unsupported');
  const parts = new Map();
  for (const [i, e] of old.elements.entries()) {
    const name = partName(e); if (!parts.has(name)) parts.set(name, { name, indices: [], north: [], south: [] });
    const p = parts.get(name); p.indices.push(i);
    if (whiteElement(e)) continue;
    assert.equal(Math.min(e.from[2], e.to[2]), -5); assert.equal(Math.max(e.from[2], e.to[2]), 21);
    for (const side of ['north', 'south']) if (e.faces[side]) p[side].push(...opaqueRects(e, side));
  }
  const ordered = [...parts.values()];
  for (const p of ordered) {
    p.north = merge(p.north); p.south = merge(p.south);
    assert.ok(totalArea(subtract(p.north, p.south)) + totalArea(subtract(p.south, p.north)) < 1e-5, `Front/back footprint differs: ${target.filename}/${p.name}`);
    p.footprint = p.north;
  }
  const contacts = [];
  for (let i = 0; i < ordered.length; i++) for (let j = i + 1; j < ordered.length; j++) {
    const a = ordered[i], b = ordered[j]; let connected = false;
    for (const r of a.footprint) for (const s of b.footprint) {
      if (intersect(r, s)) connected = true;
      if ((Math.abs(r[2] - s[0]) < EPS || Math.abs(s[2] - r[0]) < EPS) && Math.min(r[3], s[3]) - Math.max(r[1], s[1]) > EPS) connected = true;
      if ((Math.abs(r[3] - s[1]) < EPS || Math.abs(s[3] - r[1]) < EPS) && Math.min(r[2], s[2]) - Math.max(r[0], s[0]) > EPS) connected = true;
    }
    if (connected) contacts.push([a.name, b.name]);
  }
  const patches = [], changes = [], expectedSurfaces = new Map(); let uvMasks = 0, removedFaces = 0;
  const surfaceKey = info => [info.axis, round(info.plane), info.normal].join('/');
  const saveSurface = (info, rs) => {
    const key = surfaceKey(info); if (!expectedSurfaces.has(key)) expectedSurfaces.set(key, []);
    expectedSurfaces.get(key).push(...rs);
  };
  for (const [i, original] of old.elements.entries()) {
    if (whiteElement(original)) continue;
    const owner = parts.get(partName(original)), ownerIndex = ordered.indexOf(owner), e = model.elements[i];
    for (const side of Object.keys(original.faces)) {
      const info = faceInfo(original, side), cuts = [];
      for (const [pi, other] of ordered.entries()) {
        if (other === owner) continue;
        if (info.axis === 2) {
          if (pi < ownerIndex) cuts.push(...other.footprint);
        } else {
          const outward = info.plane - info.normal * 1e-5;
          for (const r of other.footprint) {
            if (info.axis === 0 && outward > r[0] && outward < r[2]) cuts.push([r[1], -5, r[3], 21]);
            if (info.axis === 1 && outward > r[1] && outward < r[3]) cuts.push([r[0], -5, r[2], 21]);
          }
        }
      }
      const opaque = opaqueRects(original, side), desired = merge(subtract(opaque, cuts));
      saveSurface(info, desired);
      const removed = totalArea(opaque) - totalArea(desired);
      if (removed < EPS) continue;
      changes.push({ element: i + 1, side, removedArea: round(removed), fragments: desired.length });
      if (!desired.length) { delete e.faces[side]; removedFaces++; continue; }
      const uv = atlasMask(original, side, desired);
      if (uv) { e.faces[side].uv = uv; uvMasks++; continue; }
      delete e.faces[side];
      for (const [n, r] of desired.entries()) {
        const patch = structuredClone(original); patch.name = `${original.name}_join_${side}_${n + 1}`; patch.faces = { [side]: { uv: [0, 14, .016, 14.05], texture: original.faces[side].texture } };
        for (let a = 0; a < 2; a++) {
          const axis = info.axes[a], positive = original.to[axis] > original.from[axis];
          patch.from[axis] = positive ? r[a] : r[a + 2]; patch.to[axis] = positive ? r[a + 2] : r[a];
        }
        patches.push(patch);
      }
    }
  }
  if (!changes.length) { skipped.push(target.filename); continue; }
  model.elements = model.elements.filter(e => Object.keys(e.faces).length);
  for (const patch of patches) {
    const existing = model.elements.find(e => !whiteElement(e) && JSON.stringify(e.from) === JSON.stringify(patch.from) && JSON.stringify(e.to) === JSON.stringify(patch.to) && Object.keys(patch.faces).every(s => !e.faces[s]));
    if (existing) Object.assign(existing.faces, patch.faces); else model.elements.push(patch);
  }
  // A face-only patch may fit on another existing border box even if its unused depth differs.
  // Move such side faces rather than retaining an otherwise unnecessary cube.
  let consolidated = true, consolidationSteps = 0;
  while (consolidated) {
    assert.ok(consolidationSteps++ < 300, `Consolidation did not converge: ${target.filename}`);
    consolidated = false;
    outer: for (const source of [...model.elements].sort((a, b) => Object.keys(a.faces).length - Object.keys(b.faces).length)) {
      if (whiteElement(source)) continue;
      for (const side of Object.keys(source.faces).filter(s => s !== 'north' && s !== 'south')) {
        const rs = opaqueRects(source, side); if (rs.length !== 1) continue;
        const info = faceInfo(source, side), r = rs[0];
        for (const target of model.elements) {
          if (target === source || whiteElement(target) || Object.keys(target.faces).length < 2) continue;
          const ownFull = info.rect.every((v, i) => Math.abs(v - r[i]) < EPS);
          if (ownFull && (Object.keys(target.faces).length < Object.keys(source.faces).length ||
              Object.keys(target.faces).length === Object.keys(source.faces).length && model.elements.indexOf(target) > model.elements.indexOf(source))) continue;
          for (const candidate of Object.keys(definitions)) {
            if (target.faces[candidate]) continue;
            const other = faceInfo(target, candidate);
            if (surfaceKey(other) !== surfaceKey(info) || !other.rect.every((v, i) => Math.abs(v - r[i]) < EPS)) continue;
            target.faces[candidate] = { uv: [0, 14, .016, 14.05], texture: source.faces[side].texture };
            delete source.faces[side];
            model.elements = model.elements.filter(e => Object.keys(e.faces).length);
            consolidated = true; break outer;
          }
        }
      }
    }
  }
  // Preserve every positive textured glyph cube, all source positions and the atlas.
  for (const e of old.elements.filter(whiteElement)) assert.deepEqual(model.elements.find(n => n.name === e.name), e);
  for (const axis of [0, 1, 2]) {
    const before = old.elements.flatMap(e => [e.from[axis], e.to[axis]]), after = model.elements.flatMap(e => [e.from[axis], e.to[axis]]);
    assert.ok(Math.abs(Math.min(...before) - Math.min(...after)) < EPS && Math.abs(Math.max(...before) - Math.max(...after)) < EPS, `Bounds changed: ${target.filename}`);
  }
  const actualSurfaces = new Map();
  for (const e of model.elements.filter(e => !whiteElement(e))) for (const side of Object.keys(e.faces)) {
    const key = surfaceKey(faceInfo(e, side)); if (!actualSurfaces.has(key)) actualSurfaces.set(key, []);
    actualSurfaces.get(key).push(...opaqueRects(e, side));
  }
  for (const key of new Set([...expectedSurfaces.keys(), ...actualSurfaces.keys()])) {
    const expected = merge(expectedSurfaces.get(key) || []), actual = merge(actualSurfaces.get(key) || []);
    assert.ok(totalArea(subtract(expected, actual)) + totalArea(subtract(actual, expected)) < 1e-5,
      `Side surface changed unexpectedly: ${target.filename}/${key}`);
  }
  // The union silhouette is preserved, with no duplicate opaque front/back coverage.
  const expected = merge(ordered.flatMap(p => p.footprint));
  for (const side of ['north', 'south']) {
    const coverage = model.elements.filter(e => !whiteElement(e) && e.faces[side]).flatMap(e => opaqueRects(e, side));
    const union = merge(coverage);
    assert.ok(totalArea(subtract(expected, union)) + totalArea(subtract(union, expected)) < 1e-5, `Silhouette changed: ${target.filename}/${side}`);
    const byPart = new Map();
    for (const e of model.elements.filter(e => !whiteElement(e) && e.faces[side])) {
      const key = partName(e); if (!byPart.has(key)) byPart.set(key, []);
      byPart.get(key).push(...opaqueRects(e, side));
    }
    const distinctPartArea = [...byPart.values()].reduce((sum, rs) => sum + totalArea(merge(rs)), 0);
    assert.ok(Math.abs(distinctPartArea - totalArea(union)) < 1e-5, `Duplicate cross-part front/back face: ${target.filename}/${side}`);
  }
  const record = { ...target, contacts, changedFaces: changes.length, removedFaces, uvMasks, cubesBefore: old.elements.length, cubesAfter: model.elements.length, changes };
  records.push(record); plans.push({ file, raw, output: formatModel(model, raw), model });
}
const summary = { inspected: targets.length, filesToChange: plans.length, unchanged: skipped, positiveGlyphsUnchanged: true,
  uvMasks: records.reduce((n, r) => n + r.uvMasks, 0), removedFaces: records.reduce((n, r) => n + r.removedFaces, 0),
  cubesBefore: records.reduce((n, r) => n + r.cubesBefore, 0), cubesAfter: records.reduce((n, r) => n + r.cubesAfter, 0),
  largestCubeIncrease: Math.max(0, ...records.map(r => r.cubesAfter - r.cubesBefore)),
  detachedPartsNotBridged: true, records };
if (apply && plans.length) {
  for (const p of plans) assert.equal(fs.readFileSync(p.file, 'utf8'), p.raw, 'Concurrent edit');
  assert.ok(fs.readFileSync(path.join(font, 'textures/flat.png')).equals(atlasRaw));
  fs.mkdirSync(path.join(root, 'backups'), { recursive: true });
  const backup = fs.mkdtempSync(path.join(root, 'backups', 'join-vietnamese-borders-'));
  fs.mkdirSync(path.join(backup, 'characters'));
  for (const p of plans) fs.writeFileSync(path.join(backup, 'characters', path.basename(p.file)), p.raw, { flag: 'wx' });
  summary.backup = backup;
  fs.writeFileSync(path.join(backup, 'manifest.json'), JSON.stringify(summary, null, 2) + '\n');
  for (const p of plans) {
    assert.equal(fs.readFileSync(p.file, 'utf8'), p.raw, 'Concurrent edit'); fs.writeFileSync(p.file, p.output);
    assert.deepEqual(JSON.parse(fs.readFileSync(p.file, 'utf8')), p.model);
  }
  assert.ok(fs.readFileSync(path.join(font, 'textures/flat.png')).equals(atlasRaw));
}
console.log(JSON.stringify({ ...summary, records: undefined }, null, 2));
