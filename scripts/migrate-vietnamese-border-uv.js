// Run without arguments to inspect; add --apply to back up and migrate.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(root, 'fonts/minecraft-ten');
const targetDir = path.join(root, 'fonts/minecraft-ten-vietnamese');
const apply = process.argv.includes('--apply');
assert.ok(process.argv.slice(2).every(arg => arg === '--apply'), 'Unknown argument');
const hash = value => createHash('sha256').update(value).digest('hex');
const same = (a, b) => Array.isArray(a) && a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 1e-8);
const shifted = uv => uv.map((v, i) => i % 2 ? Math.round((v + 0.7) * 1e10) / 1e10 : v);
const rectangle = uv => [Math.min(uv[0], uv[2]) * 62.5, Math.min(uv[1], uv[3]) * 20,
  Math.max(uv[0], uv[2]) * 62.5, Math.max(uv[1], uv[3]) * 20].map(v => Math.round(v * 1e8) / 1e8);
const plans = [], custom = [], extras = [], used = new Set(), snapshots = new Map();
let alreadyUpdatedFaces = 0, unchangedFaces = 0;

for (const filename of fs.readdirSync(path.join(targetDir, 'characters')).filter(f => f.endsWith('.json'))) {
  const destination = path.join(targetDir, 'characters', filename);
  const raw = fs.readFileSync(destination, 'utf8');
  snapshots.set(destination, hash(raw));
  const sourceFile = path.join(sourceDir, 'characters', filename);
  if (!fs.existsSync(sourceFile)) { extras.push(filename); continue; }
  const source = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
  const current = JSON.parse(raw), expected = structuredClone(current), changes = [], replacements = new Map();
  assert.deepEqual(source.texture_size, [1000, 320]);
  assert.deepEqual(current.texture_size, [1000, 320]);
  for (const [index, element] of source.elements.entries()) {
    for (const [side, face] of Object.entries(element.faces ?? {})) {
      if (!face.uv || face.texture == null) continue;
      const r = rectangle(face.uv);
      if (r[0] < 0 || r[1] < 266 || r[2] > 114 || r[3] > 288) continue;
      for (let y = Math.floor(r[1]); y < Math.ceil(r[3]); y++)
        for (let x = Math.floor(r[0]); x < Math.ceil(r[2]); x++) used.add(`${x},${y}`);
      const target = expected.elements[index]?.faces?.[side];
      if (same(target?.uv, shifted(face.uv))) { alreadyUpdatedFaces++; continue; }
      if (!same(target?.uv, face.uv)) { custom.push({ filename, element: index + 1, side }); continue; }
      const next = shifted(face.uv);
      replacements.set(JSON.stringify(target.uv), next);
      changes.push({ element: index + 1, side, before: target.uv, after: next });
      target.uv = next;
    }
  }
  if (!changes.length) continue;
  // Preserve formatting and all fields other than the selected UV arrays.
  const output = raw.replace(/("uv"\s*:\s*)\[([^\]]+)\]/g, (match, prefix, values) => {
    const next = replacements.get(JSON.stringify(JSON.parse(`[${values}]`)));
    return next ? prefix + JSON.stringify(next) : match;
  });
  assert.deepEqual(JSON.parse(output), expected, `Unexpected change in ${filename}`);
  unchangedFaces += current.elements.reduce((n, e) => n + Object.keys(e.faces ?? {}).length, 0) - changes.length;
  plans.push({ filename, destination, raw, output, changes });
}

assert.equal(custom.length, 0, `Unrecognized border faces; no files changed: ${JSON.stringify(custom)}`);
const atlasFiles = [sourceDir, targetDir].map(dir => path.join(dir, 'textures/flat.png'));
const atlasBytes = atlasFiles.map(file => fs.readFileSync(file));
const atlases = await Promise.all(atlasBytes.map(bytes => sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })));
for (const atlas of atlases) { assert.equal(atlas.info.width, 1000); assert.equal(atlas.info.height, 320); }
for (const key of used) {
  const [x, y] = key.split(',').map(Number), a = (y * 1000 + x) * 4, b = ((y + 14) * 1000 + x) * 4;
  const before = atlases[0].data.subarray(a, a + 4), after = atlases[1].data.subarray(b, b + 4);
  assert.equal(before[3], after[3], `Atlas alpha differs at ${key} +14px; stopping`);
  if (before[3]) assert.deepEqual(before, after, `Atlas color differs at ${key} +14px; stopping`);
}
const summary = {
  mode: apply ? 'apply' : 'dry-run', filesToUpdate: plans.length,
  facesToUpdate: plans.reduce((n, p) => n + p.changes.length, 0), alreadyUpdatedFaces,
  unchangedFaces, skippedCustomFiles: extras, verifiedAtlasPixels: used.size,
  files: plans.map(({ filename, changes }) => ({ filename, faces: changes.length }))
};

if (apply && plans.length) {
  // Stop on concurrent edits, and save every original before the first model write.
  for (const [file, digest] of snapshots) assert.equal(hash(fs.readFileSync(file, 'utf8')), digest, `File changed: ${file}`);
  atlasFiles.forEach((file, i) => assert.equal(hash(fs.readFileSync(file)), hash(atlasBytes[i]), `Atlas changed: ${file}`));
  fs.mkdirSync(path.join(root, 'backups'), { recursive: true });
  const backup = fs.mkdtempSync(path.join(root, 'backups', 'vietnamese-border-uv-'));
  for (const plan of plans) fs.writeFileSync(path.join(backup, plan.filename), plan.raw, { flag: 'wx' });
  summary.backup = backup;
  fs.writeFileSync(path.join(backup, 'manifest.json'), JSON.stringify({ ...summary,
    changes: plans.map(({ filename, changes }) => ({ filename, changes })) }, null, 2) + '\n');
  for (const plan of plans) {
    assert.equal(hash(fs.readFileSync(plan.destination, 'utf8')), hash(plan.raw), `File changed: ${plan.filename}`);
    fs.writeFileSync(plan.destination, plan.output);
  }
  for (const [file, digest] of snapshots) {
    const plan = plans.find(p => p.destination === file);
    assert.equal(hash(fs.readFileSync(file, 'utf8')), plan ? hash(plan.output) : digest, `Verification failed: ${file}`);
  }
  atlasFiles.forEach((file, i) => assert.equal(hash(fs.readFileSync(file)), hash(atlasBytes[i])));
}
console.log(JSON.stringify(summary, null, 2));
