// Scoped, source-derived retouch. Preview first; pass --apply to install.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const font = path.join(root, 'fonts/minecraft-ten-vietnamese');
const target = path.join(font, 'overlays/shine.png');
const apply = process.argv.includes('--apply');
assert.ok(process.argv.slice(2).every(a => a === '--apply'));
const bytes = fs.readFileSync(target);
const read = async input => sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { data: before, info } = await read(bytes);
const { data: flat, info: flatInfo } = await read(path.join(font, 'textures/test 2.png'));
assert.deepEqual([info.width, info.height, flatInfo.width, flatInfo.height], [4000, 1280, 4000, 1280]);
const after = Buffer.from(before), W = info.width;
const regions = [
  { name: 'ư', x: 536, y: 820, donorX: 2560, donorY: 88, reference: 'u' },
  // The user's second reference is the zero glyph, whose silhouette/stripe phase matches O.
  { name: 'ơ', x: 704, y: 820, donorX: 0, donorY: 432, reference: '0 (user-specified O reference)' }
];
const front = (x, y) => { const i = (y * W + x) * 4; return flat[i] < 100 && flat[i + 1] < 100 && flat[i + 2] > 200 && flat[i + 3] === 255; };
const stripe = (x, y) => ((x - y) % 128 + 128) % 128 >= 21 && ((x - y) % 128 + 128) % 128 <= 80;
const report = { applied: apply, regions: [], changedPixels: 0, changedOutsideRegions: 0 };
for (const r of regions) {
  // Validate the measured 60px stripe / 128px repeat against every visible donor pixel.
  for (let y = 0; y < 160; y++) for (let x = 0; x < 112; x++) {
    const i = ((r.donorY + y) * W + r.donorX + x) * 4;
    assert.equal(before[i + 3] > 0, front(r.donorX + x, r.donorY + y) && stripe(x, y));
    assert.equal(front(r.x + x, r.y + 44 + y), front(r.donorX + x, r.donorY + y));
  }
  let hornLit = 0, copied = 0;
  for (let yy = 0; yy < 204; yy++) for (let x = 0; x < 120; x++) {
    const y = yy - 44, i = ((r.y + yy) * W + r.x + x) * 4;
    after.fill(0, i, i + 4);
    if (y >= 0 && x < 112) {
      const j = ((r.donorY + y) * W + r.donorX + x) * 4;
      before.copy(after, i, j, j + 4); copied++;
    } else if (front(r.x + x, r.y + yy) && stripe(x, y)) {
      // Same coordinate field across the horn/body seam; no independent horn phase.
      // Above the body, clamp to its existing top alpha, never stretch its fade.
      let alpha = 255;
      if (y >= 0) {
        const row = [];
        for (let dx = 0; dx < 112; dx++) { const a = before[((r.donorY + y) * W + r.donorX + dx) * 4 + 3]; if (a) row.push(a); }
        row.sort((a, b) => a - b); alpha = row[Math.floor(row.length / 2)];
        assert.ok(alpha);
      }
      after.set([255, 255, 255, alpha], i);
      if (y < 0) hornLit++;
    }
    assert.ok(!after[i + 3] || front(r.x + x, r.y + yy), 'Highlight outside glyph mask');
    assert.equal(after[i + 3] > 0, front(r.x + x, r.y + yy) && stripe(x, y), 'Discontinuous stripe field');
  }
  // Junction is deliberately dark on both sides, with no hard cutoff at y=864.
  for (let y = 43; y <= 44; y++) for (let x = 88; x < 120; x++) assert.equal(after[((r.y + y) * W + r.x + x) * 4 + 3], 0);
  report.regions.push({ ...r, width: 120, height: 204, copiedBodyPixels: copied, hornHighlightPixels: hornLit, junctionAlpha: 0 });
}
for (let y = 0; y < info.height; y++) for (let x = 0; x < W; x++) {
  const i = (y * W + x) * 4;
  if (before.subarray(i, i + 4).equals(after.subarray(i, i + 4))) continue;
  report.changedPixels++;
  if (!regions.some(r => x >= r.x && x < r.x + 120 && y >= r.y && y < r.y + 204)) report.changedOutsideRegions++;
}
assert.equal(report.changedOutsideRegions, 0);
fs.mkdirSync(path.join(root, 'backups'), { recursive: true });
const out = fs.mkdtempSync(path.join(root, 'backups/ten-shine-horns-'));
fs.writeFileSync(path.join(out, 'shine.before.png'), bytes);
const png = await sharp(after, { raw: { width: W, height: info.height, channels: 4 } }).png().toBuffer();
fs.writeFileSync(path.join(out, 'shine.after.png'), png);

// A clearly labelled flat front-view comparison, not a claim of a Blockbench render.
const columns = [
  { x: 2560, y: 44, w: 112, title: 'U reference', data: before },
  { x: 536, y: 820, w: 120, title: 'Ư before', data: before },
  { x: 536, y: 820, w: 120, title: 'Ư after', data: after },
  { x: 0, y: 388, w: 112, title: 'O / 0 reference', data: before },
  { x: 704, y: 820, w: 120, title: 'Ơ before', data: before },
  { x: 704, y: 820, w: 120, title: 'Ơ after', data: after }
];
const tiles = [];
for (const r of columns) {
  const b = Buffer.alloc(120 * 204 * 4);
  for (let y = 0; y < 204; y++) for (let x = 0; x < r.w; x++) {
    if (!front(r.x + x, r.y + y)) continue;
    const a = r.data[((r.y + y) * W + r.x + x) * 4 + 3] / 255;
    b.set([...[92, 157, 15].map((v, k) => Math.round(v + ([187, 255, 39][k] - v) * a)), 255], (y * 120 + x) * 4);
  }
  tiles.push(await sharp(b, { raw: { width: 120, height: 204, channels: 4 } }).resize(240, 408, { kernel: 'nearest' }).png().toBuffer());
}
const labels = Buffer.from(`<svg width="1680" height="510"><style>text{font-family:Arial;fill:white;font-size:22px}</style>${columns.map((c, i) => `<text x="${i * 280 + 20}" y="32">${c.title}</text>`).join('')}<text x="20" y="495" font-size="16">Flat front preview • illustrative green palette • exact overlay alpha • no model changes</text></svg>`);
await sharp({ create: { width: 1680, height: 510, channels: 4, background: '#181c20' } }).composite([...tiles.map((input, i) => ({ input, left: i * 280 + 20, top: 58 })), { input: labels }]).png().toFile(path.join(out, 'comparison.png'));
const hash = b => createHash('sha256').update(b).digest('hex');
report.beforeSha256 = hash(bytes); report.afterSha256 = hash(png);
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
if (apply) {
  assert.ok(fs.readFileSync(target).equals(bytes), 'Source changed during retouch');
  fs.writeFileSync(target, png);
}
console.log(JSON.stringify({ output: out, ...report }, null, 2));
