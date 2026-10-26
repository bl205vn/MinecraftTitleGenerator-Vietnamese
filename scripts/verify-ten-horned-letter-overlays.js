// Check the requested U/O body lighting and that edits stay within ơ/ư.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { loadContext } from './ten-overlay-context.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), ctx = await loadContext(root);
const ids = ['outline_fade', 'shine', 'shine_random'], report = [];
for (const id of ids) {
  const relative = `fonts/minecraft-ten-vietnamese/overlays/${id}.png`;
  const { data, info } = await sharp(path.join(root, relative)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const previous = await sharp(execFileSync('git', ['show', `HEAD:${relative}`], { cwd: root })).ensureAlpha().raw().toBuffer();
  const scale = info.width / 1000, allowed = [];
  let compared = 0, differences = 0;
  const bodies = [];
  for (const [name, base] of [['ư', 'u'], ['ơ', 'o']]) {
    const body = ctx.target.regions.find(r => r.name === name && r.box[3] - r.box[1] === 40);
    const donor = ctx.source.regions.find(r => r.name === base);
    const [tx, ty, tx1, ty1] = body.box, [sx, sy, sx1, sy1] = donor.box;
    allowed.push(body.box);
    if (id !== 'outline_fade') allowed.push(...ctx.target.regions.filter(r => r.name === name && r !== body).map(r => r.box));
    for (let y = 0; y < 40 * scale; y++) for (let x = 0; x < 28 * scale; x++) {
      const a = ((ty * scale + y) * info.width + tx * scale + x) * 4;
      // Compare with the CURRENT first atlas row, as requested, including dither.
      const b = ((sy * scale + y) * info.width + sx * scale + x) * 4;
      assert.ok(data.subarray(a, a + 4).equals(data.subarray(b, b + 4)), `${id}/${name}: differs from first-row ${base} at ${x},${y}`);
      compared++;
    }
    if (id === 'outline_fade') {
      const alphas = [];
      for (let y = ty; y < ty1; y++) {
        let max = 0; for (let x = tx; x < tx1; x++) max = Math.max(max, data[(y * 1000 + x) * 4 + 3]);
        alphas.push(max);
      }
      const maximum = Math.max(...alphas), rows = alphas.flatMap((a, y) => a === maximum ? [ty + y] : []);
      assert.deepEqual(rows, [235, 236]);
      bodies.push({ name, peakRows: rows, reference: base });
    } else bodies.push({ name, body: body.box, reference: base });
  }
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const i = (y * info.width + x) * 4;
    if (data.subarray(i, i + 4).equals(previous.subarray(i, i + 4))) continue;
    const xx = x / scale, yy = y / scale;
    assert.ok(allowed.some(([x0, y0, x1, y1]) => xx >= x0 && xx < x1 && yy >= y0 && yy < y1), `${id}: changed outside horned letters at ${x},${y}`);
    differences++;
  }
  report.push({ id, size: [info.width, info.height], comparedFirstRowPixels: compared, firstRowDifferences: 0, changedPixels: differences, changedOutsideRequestedLetters: 0, bodies });
  console.log(`${id}: PASS; ${compared} body pixels match first-row U/O exactly; ${differences} changed pixels confined to ơ/ư.`);
}
for (const id of fs.readdirSync(path.join(ctx.target.base, 'overlays')).filter(f => f.endsWith('.png') && !ids.includes(f.slice(0, -4)))) {
  const relative = `fonts/minecraft-ten-vietnamese/overlays/${id}`;
  assert.ok(fs.readFileSync(path.join(root, relative)).equals(execFileSync('git', ['show', `HEAD:${relative}`], { cwd: root })), `Other overlay changed: ${id}`);
}
fs.mkdirSync(path.join(root, 'backups/ten-overlay-review'), { recursive: true });
fs.writeFileSync(path.join(root, 'backups/ten-overlay-review/horned-letter-body-reference.json'), JSON.stringify(report, null, 2) + '\n');
console.log('PASS: the other 18 overlay PNGs are byte-identical to HEAD.');
