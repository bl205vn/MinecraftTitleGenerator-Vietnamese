// Restore only accent/horn cap PRESENCE from the user's 3228b75 snapshot.
// Keep current letter caps, geometry, remaining UVs, credits, and atlas untouched.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'fonts/minecraft-ten-vietnamese/characters');
const reference = path.join(root, 'backups/MinecraftTitleGenerator-Vietnamese-3228b7591b4c7e6e373ee8eb5d59de25daac12e6/fonts/minecraft-ten-vietnamese/characters');
const apply = process.argv.includes('--apply');
assert.ok(process.argv.slice(2).every(a => a === '--apply'));
const white = e => e.faces.north && e.to.every((v, i) => v > e.from[i]);
const signature = e => e.faces.north.uv.join(',');
const accents = new Set();
for (const name of ['acute', 'hookabove', 'tilde', 'dotbelow', 'breve', '^']) {
  const m = JSON.parse(fs.readFileSync(path.join(reference, name + '.json')));
  for (const e of m.elements.filter(white)) accents.add(signature(e));
}
accents.add('3.728,10.4,3.472,11');
accents.add('2.496,10.25,2.624,10.8');
accents.add('3.168,10.25,3.296,10.8');
const plans = [];
let removed = 0, accentCubes = 0, letterCubes = 0;
for (const name of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
  const file = path.join(dir, name), raw = fs.readFileSync(file, 'utf8'), model = JSON.parse(raw);
  const old = JSON.parse(fs.readFileSync(path.join(reference, name)));
  const deletions = new Set();
  for (const [i, e] of model.elements.entries()) {
    if (!white(e)) continue;
    if (!accents.has(signature(e))) {
      letterCubes++;
      assert.ok(e.faces.up && e.faces.down, `Incomplete letter: ${name}/${i}`);
      continue;
    }
    accentCubes++;
    const b = old.elements[i];
    assert.deepEqual(e.from, b.from, `Changed element order: ${name}/${i}`);
    assert.deepEqual(e.to, b.to);
    assert.deepEqual(e.faces.north, b.faces.north);
    for (const side of ['up', 'down']) {
      if (!b.faces[side] && e.faces[side]) {
        delete e.faces[side]; deletions.add(`${i}/${side}`); removed++;
      }
      assert.equal(!!e.faces[side], !!b.faces[side], `Cap mask mismatch: ${name}/${i}/${side}`);
    }
  }
  if (!deletions.size) continue;
  let i = -1, inElements = false;
  const output = raw.split(/(?<=\n)/).filter(line => {
    if (/^\t"elements": \[/.test(line)) inElements = true;
    if (inElements && /^\t\t\{\s*$/.test(line)) i++;
    const side = line.match(/^\t\t\t\t"(up|down)":/);
    return !(side && deletions.has(`${i}/${side[1]}`));
  }).join('').replace(/,(\r?\n\s*\})/g, '$1');
  assert.deepEqual(JSON.parse(output), model, `Unexpected edit: ${name}`);
  plans.push({ file, raw, output });
}
let backup;
if (apply && plans.length) {
  backup = fs.mkdtempSync(path.join(root, 'backups/restore-accent-cap-mask-'));
  for (const p of plans) {
    assert.equal(fs.readFileSync(p.file, 'utf8'), p.raw);
    fs.writeFileSync(path.join(backup, path.basename(p.file)), p.raw, { flag: 'wx' });
  }
  for (const p of plans) {
    assert.equal(fs.readFileSync(p.file, 'utf8'), p.raw);
    fs.writeFileSync(p.file, p.output);
  }
}
console.log(JSON.stringify({ apply, modelsChanged: plans.length, removedAccentCaps: removed, accentCubes, letterCubesWithBothCaps: letterCubes, backup }, null, 2));
