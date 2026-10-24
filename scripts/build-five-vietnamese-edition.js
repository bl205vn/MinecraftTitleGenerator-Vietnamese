// Generate Edition from Flat using the exact original Minecraft Five palette/edge rule.
// node scripts/build-five-vietnamese-edition.js --apply
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apply = process.argv.includes('--apply');
assert.ok(process.argv.slice(2).every(arg => arg === '--apply'));
async function read(file) {
  return sharp(path.join(root, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}
function edition({ data, info }) {
  const output = Buffer.from(data);
  const white = i => i < data.length && data[i] === 255 && data[i + 1] === 255 && data[i + 2] === 255 && data[i + 3] === 255;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    assert.equal(data[i + 3], 255, 'Unexpected semitransparent Flat pixel');
    const rgb = [...data.subarray(i, i + 3)].join(',');
    let color;
    if (rgb === '255,255,255') color = white(i + info.width * 4) ? [208, 197, 192] : [237, 229, 226];
    else if (rgb === '176,176,176' || rgb === '84,84,84') color = [61, 57, 56];
    else { assert.equal(rgb, '0,0,0', 'Unrecognized Flat color'); continue; }
    output.set(color, i);
  }
  return output;
}
const original = await read('fonts/minecraft-five/textures/flat.png');
const originalEdition = await read('fonts/minecraft-five/textures/edition.png');
assert.ok(edition(original).equals(originalEdition.data), 'Original Edition pixel regression');
const input = 'fonts/minecraft-five-vietnamese/textures/flat.png';
const source = await read(input);
assert.deepEqual([source.info.width, source.info.height], [1000, 320]);
const result = edition(source);
for (let i = 3; i < result.length; i += 4) assert.equal(result[i], source.data[i], 'Alpha changed');
const target = path.join(root, 'fonts/minecraft-five-vietnamese/textures/edition.png');
let backup;
if (apply) {
  if (fs.existsSync(target)) {
    const existing = await read(path.relative(root, target));
    if (existing.data.equals(result)) { console.log('Edition is already up to date.'); process.exit(0); }
    fs.mkdirSync(path.join(root, 'backups'), { recursive: true });
    backup = fs.mkdtempSync(path.join(root, 'backups/five-edition-'));
    fs.copyFileSync(target, path.join(backup, 'edition.png'), fs.constants.COPYFILE_EXCL);
  }
  await sharp(result, { raw: source.info }).png().toFile(target);
  assert.ok((await read(path.relative(root, target))).data.equals(result), 'Saved image mismatch');
}
console.log(JSON.stringify({ apply, output: target, originalEditionExactPixelMatch: true, alphaPreserved: true, backup }, null, 2));
