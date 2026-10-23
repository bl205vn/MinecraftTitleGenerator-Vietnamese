// Full LETTER caps, consistent cap UV directions, and inherited credits.
// Accent and horn cap presence is preserved; missing accent caps are intentional.
// Dry run by default. --apply backs up every changed file before writing.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const font = path.join(root, 'fonts/minecraft-ten-vietnamese');
const dir = path.join(font, 'characters');
const apply = process.argv.includes('--apply');
assert.ok(process.argv.slice(2).every(arg => arg === '--apply'));
const originals = new Set(fs.readdirSync(path.join(root, 'fonts/minecraft-ten/characters')));
const own = new Set(['acute.json', 'hookabove.json', 'tilde.json', 'dotbelow.json', 'breve.json']);
const models = fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(name => {
  const file = path.join(dir, name), raw = fs.readFileSync(file, 'utf8');
  return { name, file, raw, model: JSON.parse(raw) };
});
const white = e => e.faces.north && e.to.every((v, i) => v > e.from[i]);
const signature = e => e.faces.north.uv.join(',');
const accents = new Set(models.filter(e => own.has(e.name) || e.name === '^.json')
  .flatMap(e => e.model.elements.filter(white).map(signature)));
accents.add('3.728,10.4,3.472,11'); // Mirrored acute = grave.
accents.add('2.496,10.25,2.624,10.8'); // U horn.
accents.add('3.168,10.25,3.296,10.8'); // O horn.
const templates = new Map();
for (const { model } of models) for (const e of model.elements.filter(white)) {
  const key = signature(e), record = templates.get(key) ?? {};
  for (const side of ['up', 'down']) if (e.faces[side]) record[side] ??= structuredClone(e.faces[side]);
  templates.set(key, record);
}
const plans = [], records = [];
let added = 0, reoriented = 0, whiteCount = 0;
for (const entry of models) {
  const { model, name } = entry;
  // Original alphabet files retain their existing UVs and credits.
  if (originals.has(name)) continue;
  const before = structuredClone(model);
  model.credit = own.has(name) ? 'By bl205vn' : 'By Ewan Howell & bl205vn';
  for (const [index, e] of model.elements.entries()) {
    if (!white(e)) continue;
    whiteCount++;
    assert.ok(!e.rotation?.angle, `Rotated white cube: ${name}`);
    for (const side of ['up', 'down']) {
      if (!e.faces[side] && accents.has(signature(e))) continue;
      const previous = structuredClone(e.faces[side]);
      const n = e.faces.north.uv;
      const mirrored = templates.get([n[2], n[1], n[0], n[3]].join(','));
      let face = structuredClone(previous ?? templates.get(signature(e))?.[side] ?? mirrored?.[side]);
      assert.ok(face, `No letter cap template: ${name}/${index}/${side}`);
      face.texture = e.faces.north.texture;
      let uv = face.uv;
      if (face.rotation === 180) uv = [...uv.slice(2), ...uv.slice(0, 2)];
      else assert.ok(!face.rotation, `Unsupported cap rotation: ${name}`);
      delete face.rotation;
      const [u0, v0, u1, v1] = uv;
      // Original letters use decreasing V for BOTH caps; U runs opposite north.
      const descendingU = e.faces.north.uv[2] > e.faces.north.uv[0];
      face.uv = [descendingU ? Math.max(u0, u1) : Math.min(u0, u1), Math.max(v0, v1),
        descendingU ? Math.min(u0, u1) : Math.max(u0, u1), Math.min(v0, v1)];
      e.faces[side] = face;
      if (!previous) added++;
      else if (JSON.stringify(previous) !== JSON.stringify(face)) reoriented++;
    }
  }
  // Prove this changes only credits and the up/down faces of positive white cubes.
  const expected = structuredClone(model);
  expected.credit = before.credit;
  for (let i = 0; i < before.elements.length; i++) if (white(before.elements[i])) {
    for (const side of ['up', 'down']) {
      if (before.elements[i].faces[side]) expected.elements[i].faces[side] = before.elements[i].faces[side];
      else delete expected.elements[i].faces[side];
    }
  }
  assert.deepEqual(expected, before, `Unexpected geometry/border change: ${name}`);
  if (JSON.stringify(model) === JSON.stringify(before)) continue;
  // Preserve Blockbench's compact arrays and face objects to keep diffs readable.
  let output = entry.raw.replace(/("credit"\s*:\s*)"[^"]*"/, `$1${JSON.stringify(model.credit)}`);
  let index = -1, inElements = false;
  output = output.split(/(?<=\n)/).map(line => {
    if (/^\t"elements": \[/.test(line)) inElements = true;
    if (inElements && /^\t\t\{\s*$/.test(line)) index++;
    if (!inElements || index < 0 || !white(model.elements[index])) return line;
    const side = line.match(/^\t\t\t\t"(up|down)":/);
    if (side) return '';
    if (/^\t\t\t"faces": \{/.test(line)) {
      return line + ['up', 'down'].filter(s => model.elements[index].faces[s]).map(s => `\t\t\t\t"${s}": ${JSON.stringify(model.elements[index].faces[s])},\n`).join('');
    }
    return line;
  }).join('').replace(/,(\r?\n\s*\})/g, '$1');
  assert.deepEqual(JSON.parse(output), model, `Formatting mismatch: ${name}`);
  plans.push({ file: entry.file, before: Buffer.from(entry.raw), after: Buffer.from(output) });
  records.push(name);
}
const pixelsAdded = 0; // Cap restoration never edits the atlas.
const fontFile = path.join(root, 'fonts.json'), fontBefore = fs.readFileSync(fontFile);
const metadata = JSON.parse(fontBefore);
const variant = metadata.flatMap(f => f.variants ?? []).find(f => f.id === 'minecraft-ten-vietnamese');
assert.ok(variant);
variant.author = 'Ewan Howell & bl205vn';
const fontAfter = Buffer.from(fontBefore.toString('utf8').replace(
  /("id":\s*"minecraft-ten-vietnamese"[\s\S]*?"author":\s*)"[^"]*"/,
  '$1"Ewan Howell & bl205vn"',
));
assert.deepEqual(JSON.parse(fontAfter), metadata);
if (!fontAfter.equals(fontBefore)) plans.push({ file: fontFile, before: fontBefore, after: fontAfter });
let backup;
if (apply && plans.length) {
  fs.mkdirSync(path.join(root, 'backups'), { recursive: true });
  backup = fs.mkdtempSync(path.join(root, 'backups/full-white-caps-'));
  for (const p of plans) {
    assert.ok(fs.readFileSync(p.file).equals(p.before), 'Concurrent change');
    const dest = path.join(backup, path.relative(root, p.file));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, p.before, { flag: 'wx' });
  }
  fs.writeFileSync(path.join(backup, 'manifest.json'), JSON.stringify({ records, added, reoriented, whiteCount, pixelsAdded }, null, 2));
  for (const p of plans) { assert.ok(fs.readFileSync(p.file).equals(p.before)); fs.writeFileSync(p.file, p.after); }
}
console.log(JSON.stringify({ apply, modelsChanged: records.length, whiteCount, added, reoriented, pixelsAdded, filesToWrite: plans.length, backup }, null, 2));
