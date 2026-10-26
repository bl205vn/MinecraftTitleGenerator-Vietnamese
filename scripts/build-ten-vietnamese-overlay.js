// Deliberately accepts exactly ONE overlay. Generate, audit, and review before the next.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { loadContext, W, H, binary } from './ten-overlay-context.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const id = process.argv[2], apply = process.argv.includes('--apply');
assert.ok(id && /^[a-z0-9_]+$/.test(id), 'Specify one overlay ID');
assert.ok(process.argv.slice(3).every(a => a === '--apply'));
const ctx = await loadContext(root);
const digest = data => createHash('sha256').update(data).digest('hex');
const targetHash = digest(ctx.target.raw);
const originalFile = path.join(ctx.source.base, 'overlays', id + '.png');
const original = await sharp(originalFile).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const scale = original.info.width / W;
assert.equal(original.info.height, H * scale);
function basic(font) {
  const mask = new Uint8Array(W * H);
  const c = font.c, is = (x, y, color = 1) => x >= 0 && x < W && y >= 0 && y < H && c[y * W + x] === color;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (id.startsWith('highlights_')) {
      const [dx, dy] = { highlights_bottom: [0, 1], highlights_top: [0, -1], highlights_left: [-1, 0], highlights_right: [1, 0] }[id];
      mask[i] = c[i] === 1 && !is(x + dx, y + dy) ? 1 : 0;
    } else if (id === 'inset_outline') mask[i] = font.distance[i] === 2 ? 1 : 0;
    else if (id === 'outline') {
      const tops = font === ctx.source ? [0, 86, 172] : [0, 86, 183];
      const bottoms = font === ctx.source ? [83, 169, 263] : [83, 169, 277];
      mask[i] = c[i] === 1 ? font.distance[i] === 1 ? 1 : 0
        : c[i] === 2 ? (!is(x - 1, y, 2) || !is(x + 1, y, 2) || tops.includes(y)) ? 1 : 0
        : c[i] === 3 ? (!is(x - 1, y, 3) || !is(x + 1, y, 3) || bottoms.includes(y)) ? 1 : 0 : 0;
    } else throw Error('Rule not installed: ' + id);
  }
  return binary(mask);
}
let sourceGenerated, generated;
const basicIDs = ['highlights_bottom', 'highlights_top', 'highlights_left', 'highlights_right', 'inset_outline', 'outline'];
if (basicIDs.includes(id)) {
  sourceGenerated = basic(ctx.source); generated = basic(ctx.target);
} else {
  const { generate } = await import('./ten-overlay-special.js');
  sourceGenerated = await generate(id, ctx.source, ctx);
  generated = await generate(id, ctx.target, ctx);
}
assert.equal(generated.length, original.info.width * original.info.height * 4);
let originalDifferences = 0, visible = 0, outsideFlat = 0, customVisible = 0;
const colors = new Set();
for (let i = 0; i < generated.length; i += 4) {
  if (sourceGenerated[i + 3] !== original.data[i + 3] || (sourceGenerated[i + 3] &&
      !sourceGenerated.subarray(i, i + 4).equals(original.data.subarray(i, i + 4)))) originalDifferences++;
  if (!generated[i + 3]) { generated[i] = generated[i + 1] = generated[i + 2] = 0; continue; }
  const x = Math.floor(i / 4 % original.info.width / scale), y = Math.floor(Math.floor(i / 4 / original.info.width) / scale);
  if (ctx.target.c[y * W + x] === 0 || ctx.target.c[y * W + x] === 4) outsideFlat++;
  if ((y >= 183 && x >= 134) || (y < 86 && x >= 902 && x < 938)) customVisible++;
  visible++; colors.add([...generated.subarray(i, i + 4)].join(','));
}
assert.equal(outsideFlat, 0, 'Stray overlay pixels outside white/gray surfaces');
assert.ok(visible && customVisible, 'Overlay has no custom Vietnamese coverage');
const sourcePalette = new Set();
for (let i = 0; i < original.data.length; i += 4) if (original.data[i + 3]) sourcePalette.add([...original.data.subarray(i, i + 4)].join(','));
const newPaletteValues = [...colors].filter(c => !sourcePalette.has(c));
assert.equal(newPaletteValues.length, 0, 'Unexpected RGB/alpha values in extension: ' + newPaletteValues.slice(0, 8).join(';'));
// Explicit allowance only for measured omissions/strays in the original highlights.
const allowed = { highlights_top: 4, highlights_bottom: 20 }[id] ?? 0;
assert.ok(originalDifferences <= allowed, `${id}: original-rule mismatch ${originalDifferences} > ${allowed}`);
const output = path.join(ctx.target.base, 'overlays', id + '.png');
const reportDir = path.join(root, 'backups/ten-overlay-review/results');
let backup;
if (apply) {
  assert.equal(digest(fs.readFileSync(path.join(ctx.target.base, 'textures/flat.png'))), targetHash, 'Atlas changed during generation');
  fs.mkdirSync(path.dirname(output), { recursive: true }); fs.mkdirSync(reportDir, { recursive: true });
  if (fs.existsSync(output)) {
    backup = fs.mkdtempSync(path.join(root, 'backups/ten-overlay-previous-'));
    fs.copyFileSync(output, path.join(backup, id + '.png'));
  }
  await sharp(generated, { raw: { width: W * scale, height: H * scale, channels: 4 } }).png().toFile(output);
  const saved = await sharp(output).ensureAlpha().raw().toBuffer(); assert.ok(saved.equals(generated), 'PNG pixel round-trip failed');
  const reviewPixels = Buffer.from(ctx.target.data);
  for (let i = 0; i < ctx.target.c.length; i++) if (ctx.target.c[i] === 1) reviewPixels.set([104, 111, 125], i * 4);
  const flat = await sharp(reviewPixels, { raw: { width: W, height: H, channels: 4 } }).resize(W * scale, H * scale, { kernel: 'nearest' }).png().toBuffer();
  const composite = await sharp(flat).composite([{ input: await sharp(generated, { raw: { width: W * scale, height: H * scale, channels: 4 } }).png().toBuffer() }]).png().toBuffer();
  await sharp(composite).resize(W, H, { kernel: 'nearest' }).png().toFile(path.join(reportDir, id + '-preview.png'));
  // Register just this completed, verified overlay.
  const metadataFile = path.join(ctx.target.base, 'textures.json');
  const metadata = JSON.parse(fs.readFileSync(metadataFile));
  const originals = JSON.parse(fs.readFileSync(path.join(ctx.source.base, 'textures.json'))).overlays;
  metadata.overlays[id] = { ...originals[id], author: `${originals[id].author} & bl205vn` };
  fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2) + '\n');
}
const report = { id, apply, size: [W * scale, H * scale], originalRuleDifferences: originalDifferences,
  sourceComparisonMode: basicIDs.includes(id) || id === 'glass_tempered' ? 'independent analytic regeneration' : 'original artwork preservation plus new-region extension',
  allowedOriginalQuirks: allowed, visiblePixels: visible, customVietnamesePixels: customVisible, colors: colors.size,
  strayPixels: outsideFlat, newPaletteValues: newPaletteValues.length, flatSHA256: targetHash, output, backup };
if (apply) fs.writeFileSync(path.join(reportDir, id + '.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
