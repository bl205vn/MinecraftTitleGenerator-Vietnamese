// Independent asset audit; never regenerates an overlay.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { loadContext, W, H } from './ten-overlay-context.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), ctx = await loadContext(root);
const files = fs.readdirSync(path.join(ctx.source.base, 'overlays')).filter(f => f.endsWith('.png')).sort();
const targetFiles = fs.readdirSync(path.join(ctx.target.base, 'overlays')).filter(f => f.endsWith('.png')).sort();
assert.deepEqual(targetFiles, files);
const metadata = JSON.parse(fs.readFileSync(path.join(ctx.target.base, 'textures.json')));
const sourceMetadata = JSON.parse(fs.readFileSync(path.join(ctx.source.base, 'textures.json')));
assert.deepEqual(Object.keys(metadata.overlays).sort(), files.map(f => f.slice(0, -4)).sort());
const report = { count: files.length, flatSHA256: createHash('sha256').update(ctx.target.raw).digest('hex'),
  actualBlockbenchVerified: false, overlays: [] };
const pairs = [];
for (const r of ctx.source.regions) {
  const t = ctx.target.regions.find(t => t.name === r.name && t.box[2] - t.box[0] === r.box[2] - r.box[0] && t.box[3] - t.box[1] === r.box[3] - r.box[1]);
  if (!t) continue;
  let same = true;
  for (let y = 0; y < r.box[3] - r.box[1] && same; y++) for (let x = 0; x < r.box[2] - r.box[0]; x++)
    if (ctx.source.white[(r.box[1] + y) * W + r.box[0] + x] !== ctx.target.white[(t.box[1] + y) * W + t.box[0] + x]) { same = false; break; }
  if (same) pairs.push({ source: r.box, target: t.box });
}
for (const file of files) {
  const name = file.slice(0, -4), source = await sharp(path.join(ctx.source.base, 'overlays', file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const target = await sharp(path.join(ctx.target.base, 'overlays', file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual([target.info.width, target.info.height], [source.info.width, source.info.height]);
  const s = source.info.width / W, palette = new Set(), sw = W * s;
  for (let i = 0; i < source.data.length; i += 4) if (source.data[i + 3]) palette.add([...source.data.subarray(i, i + 4)].join(','));
  let stray = 0, newColors = 0, hiddenRGB = 0, visible = 0;
  for (let y = 0; y < H * s; y++) for (let x = 0; x < W * s; x++) {
    const i = (y * sw + x) * 4;
    if (!target.data[i + 3]) { if (target.data[i] || target.data[i + 1] || target.data[i + 2]) hiddenRGB++; continue; }
    visible++;
    const c = ctx.target.c[Math.floor(y / s) * W + Math.floor(x / s)];
    if (c < 1 || c > 3) stray++;
    if (!palette.has([...target.data.subarray(i, i + 4)].join(','))) newColors++;
  }
  assert.equal(stray, 0, name + ' stray pixels'); assert.equal(newColors, 0, name + ' unexpected palette');
  assert.equal(hiddenRGB, 0, name + ' hidden RGB'); assert.ok(visible, name + ' empty overlay');
  assert.equal(metadata.overlays[name].author, sourceMetadata.overlays[name].author + ' & bl205vn');
  const generation = JSON.parse(fs.readFileSync(path.join(root, 'backups/ten-overlay-review/results', name + '.json')));
  assert.equal(generation.flatSHA256, report.flatSHA256, name + ' was generated against another atlas');
  let sharedPixels = 0, sharedDifferences = 0;
  for (const pair of pairs) {
    const [sx, sy, sx1, sy1] = pair.source, [tx, ty] = pair.target;
    for (let y = 0; y < (sy1 - sy) * s; y++) for (let x = 0; x < (sx1 - sx) * s; x++) {
      if (!ctx.source.white[(sy + Math.floor(y / s)) * W + sx + Math.floor(x / s)]) continue;
      const a = ((sy * s + y) * sw + sx * s + x) * 4, b = ((ty * s + y) * sw + tx * s + x) * 4;
      sharedPixels++;
      if (source.data[a + 3] !== target.data[b + 3] || (source.data[a + 3] && !source.data.subarray(a, a + 4).equals(target.data.subarray(b, b + 4)))) sharedDifferences++;
    }
  }
  assert.equal(sharedDifferences, { highlights_top: 4, highlights_bottom: 20 }[name] ?? 0,
    name + ' changed the original corresponding glyph artwork');
  const customRegionCoverage = [];
  for (const region of ctx.target.regions.filter(r => ['đ', 'ơ', 'ư', 'acute', 'breve', 'hookabove', 'tilde', 'dotbelow'].includes(r.name))) {
    const [x0, y0, x1, y1] = region.box; let count = 0;
    for (let y = y0 * s; y < y1 * s; y++) for (let x = x0 * s; x < x1 * s; x++)
      if (ctx.target.white[Math.floor(y / s) * W + Math.floor(x / s)] && target.data[(y * sw + x) * 4 + 3]) count++;
    customRegionCoverage.push({ name: region.name, box: region.box, visible: count });
    if (!['cracks', 'tiles', 'texture_highlight_1', 'texture_highlight_2', 'outline_fade', 'edge_fade'].includes(name))
      assert.ok(count, name + ': missing effect on custom region ' + region.name + '/' + region.box);
  }
  report.overlays.push({ name, size: [sw, H * s], visible, stray, newColors, hiddenRGB, sharedPixels, sharedDifferences,
    method: generation.sourceComparisonMode ?? 'independent analytic regeneration', customPixels: generation.customVietnamesePixels, customRegionCoverage });
  console.log(`${name}: PASS; shared glyph differences=${sharedDifferences}/${sharedPixels}; custom pixels=${generation.customVietnamesePixels}`);
}
fs.writeFileSync(path.join(root, 'backups/ten-overlay-review/verification.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`PASS ${files.length} overlays; PNG dimensions/palette/alpha/atlas/metadata verified.`);
