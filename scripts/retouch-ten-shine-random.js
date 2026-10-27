// Exact diagonal-field transfer from the authored Random atlas. Preview by default.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const font = path.join(root, 'fonts/minecraft-ten-vietnamese');
const target = path.join(font, 'overlays/shine_random.png');
const apply = process.argv.includes('--apply');
assert.ok(process.argv.slice(2).every(a => a === '--apply'));
const read = async p => sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const bytes = fs.readFileSync(target), beforeImage = await read(bytes);
const { data: before, info } = beforeImage, W = 4000, H = 1280;
assert.deepEqual([info.width, info.height], [W, H]);
const source = await read(path.join(root, 'fonts/minecraft-ten/overlays/shine_random.png'));
assert.deepEqual([source.info.width, source.info.height], [W, H]);
const sourceFlat = await read(path.join(root, 'fonts/minecraft-ten/textures/flat.png'));
const flat = await read(path.join(font, 'textures/flat.png'));
assert.deepEqual([flat.info.width, flat.info.height, sourceFlat.info.width, sourceFlat.info.height], [1000, 320, 1000, 320]);
const isFront = (data, x, y) => {
  const i = (Math.floor(y / 4) * 1000 + Math.floor(x / 4)) * 4;
  return data[i] === 255 && data[i + 1] === 255 && data[i + 2] === 255 && data[i + 3] === 255;
};
const field = new Map();
// Learn every observed diagonal from the two original letter rows. Do not
// invent a repeating period or extrapolate a missing horn from its nearest pixel.
for (let y = 88; y < 592; y++) for (let x = 0; x < W; x++) {
  if (!isFront(sourceFlat.data, x, y)) continue;
  const lit = source.data[(y * W + x) * 4 + 3] > 0, diagonal = x - y;
  if (field.has(diagonal)) assert.equal(field.get(diagonal), lit, `Inconsistent source diagonal ${diagonal}`);
  field.set(diagonal, lit);
}
const regions = [
  // Đ's left stem begins 16px after its crossbar's left edge. Keep that
  // alignment to D and continue the field across the widened hole/right stem.
  { name: 'đ', x: 3608, y: 88, w: 144, h: 160, bodyY: 88, originX: 3624, sx: 480, sy: 88, reference: 'D' },
  { name: 'ư', x: 536, y: 820, w: 120, h: 204, bodyY: 864, originX: 536, sx: 2560, sy: 88, reference: 'U' },
  // The user explicitly supplied (0,432), the zero cell, as the O reference.
  { name: 'ơ', x: 704, y: 820, w: 120, h: 204, bodyY: 864, originX: 704, sx: 0, sy: 432, reference: 'O / 0 at (0,432)' }
];
const after = Buffer.from(before), records = [];
for (const r of regions) {
  const fade = [];
  for (let y = 0; y < 160; y++) {
    const row = [];
    for (let x = 0; x < 112; x++) {
      const i = ((r.sy + y) * W + r.sx + x) * 4;
      assert.ok(source.data.subarray(i, i + 4).equals(before.subarray(i, i + 4)), 'Current donor differs from authored source');
      if (source.data[i + 3]) row.push(source.data[i + 3]);
    }
    row.sort((a, b) => a - b); assert.ok(row.length);
    fade.push(row[Math.floor(row.length / 2)]);
  }
  let changes = 0, hornLit = 0, extrapolatedPixels = 0, copiedCore = 0;
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
    const i = (y * W + x) * 4, lx = x - r.originX, ly = y - r.bodyY;
    after.fill(0, i, i + 4);
    if (isFront(flat.data, x, y)) {
      const diagonal = r.sx - r.sy + lx - ly;
      assert.ok(field.has(diagonal), `Unobserved source diagonal ${diagonal}`);
      if (field.get(diagonal)) {
        const sx = r.sx + lx, sy = r.sy + ly, j = (sy * W + sx) * 4;
        let alpha = ly < 0 ? fade[0] : fade[ly];
        if (ly >= 0 && sx >= 0 && sx < W && isFront(sourceFlat.data, sx, sy) && source.data[j + 3]) alpha = source.data[j + 3];
        else extrapolatedPixels++;
        after.set([255, 255, 255, alpha], i);
        if (ly < 0) hornLit++;
      }
    }
    if (r.name !== 'đ' && ly >= 0 && lx < 112) {
      const j = ((r.sy + ly) * W + r.sx + lx) * 4;
      // Compare visible alpha/RGB; transparent hidden RGB is not artwork.
      assert.equal(after[i + 3], before[j + 3]);
      if (after[i + 3]) assert.ok(after.subarray(i, i + 4).equals(before.subarray(j, j + 4)));
      copiedCore++;
    }
    assert.ok(!after[i + 3] || isFront(flat.data, x, y));
    if (!before.subarray(i, i + 4).equals(after.subarray(i, i + 4))) changes++;
  }
  records.push({ ...r, changedPixels: changes, hornLit, copiedCore, extrapolatedPixels });
}
let outside = 0, changed = 0;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = (y * W + x) * 4;
  if (before.subarray(i, i + 4).equals(after.subarray(i, i + 4))) continue;
  changed++;
  if (!regions.some(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h)) outside++;
}
assert.equal(outside, 0);
const hash = b => createHash('sha256').update(b).digest('hex');
const protectedPaths = ['textures', 'overlays', 'characters'].flatMap(dir => fs.readdirSync(path.join(font, dir)).map(f => path.join(font, dir, f))).filter(p => fs.statSync(p).isFile() && p !== target);
const protectedHashes = new Map(protectedPaths.map(p => [p, hash(fs.readFileSync(p))]));
fs.mkdirSync(path.join(root, 'backups'), { recursive: true });
const out = fs.mkdtempSync(path.join(root, 'backups/ten-shine-random-'));
fs.writeFileSync(path.join(out, 'shine_random.before.png'), bytes);
const png = await sharp(after, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
fs.writeFileSync(path.join(out, 'shine_random.after.png'), png);

const tiles = [], labels = [];
for (const [row, r] of regions.entries()) {
  for (let col = 0; col < 3; col++) {
    const data = col === 2 ? after : before, tile = Buffer.alloc(160 * 216 * 4);
    for (let y = 0; y < 204; y++) for (let x = 0; x < 144; x++) {
      const tx = col === 0 ? r.sx + x : r.x + x;
      const ty = col === 0 ? r.sy - 44 + y : r.y - (r.name === 'đ' ? 44 : 0) + y;
      if (col === 0 && (x >= 112 || y < 44)) continue;
      if (col !== 0 && (x >= r.w || (r.name === 'đ' && y < 44))) continue;
      if (!isFront(flat.data, tx, ty)) continue;
      const a = data[(ty * W + tx) * 4 + 3] / 255;
      tile.set([...[92,157,15].map((v,k) => Math.round(v + ([187,255,39][k] - v) * a)), 255], ((y + 6) * 160 + x + 8) * 4);
    }
    tiles.push({ input: await sharp(tile, { raw: { width: 160, height: 216, channels: 4 } }).resize(320,432,{kernel:'nearest'}).png().toBuffer(), left: col * 340 + 10, top: row * 480 + 44 });
    labels.push(`<text x="${col * 340 + 24}" y="${row * 480 + 32}">${col === 0 ? r.reference : r.name.toUpperCase() + (col === 1 ? ' before' : ' after')}</text>`);
  }
}
const svg = Buffer.from(`<svg width="1020" height="1480"><style>text{font-family:Arial;fill:white;font-size:22px}</style>${labels.join('')}<text x="15" y="1460" font-size="16">Flat front comparison • illustrative green palette • exact overlay alpha</text></svg>`);
await sharp({create:{width:1020,height:1480,channels:4,background:'#181c20'}}).composite([...tiles,{input:svg}]).png().toFile(path.join(out,'comparison.png'));
const report = { applied: apply, changedPixels: changed, changedOutsideRegions: outside, sourceFieldDiagonals: field.size, beforeSha256: hash(bytes), afterSha256: hash(png), regions: records };
if (apply) {
  assert.ok(fs.readFileSync(target).equals(bytes), 'Overlay changed during preview');
  fs.copyFileSync(path.join(out, 'shine_random.after.png'), target);
}
for (const [p,h] of protectedHashes) assert.equal(hash(fs.readFileSync(p)),h,`Protected file changed: ${p}`);
report.protectedFilesUnchanged = protectedHashes.size;
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({ output:out,...report },null,2));
