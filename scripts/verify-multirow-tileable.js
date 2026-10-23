// Render the actual plugin tileable-paint loop on Canvas, without Blockbench.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { Canvas, loadImage } from 'skia-canvas';
import sharp from 'sharp';
const root = new URL('../', import.meta.url);
const source = fs.readFileSync(new URL('plugin/minecraft_title_generator.js', root), 'utf8');
const previous = execFileSync('git', ['show', 'HEAD:plugin/minecraft_title_generator.js'], { cwd: root, encoding: 'utf8' });
const helper = source.match(/  function collectTileableUVRegions\([\s\S]*?\n  \}/)?.[0];
assert.ok(helper);
function paintLoop(text) {
  const start = text.indexOf('      for (const [i, char] of Object.values(');
  const end = text.indexOf('      if (fonts[args.font].overlay', start);
  assert.ok(start >= 0 && end > start);
  return text.slice(start, end);
}
class CanvasFrame {
  constructor(w, h) { this.canvas = new Canvas(w, h); this.ctx = this.canvas.getContext('2d'); }
  get width() { return this.canvas.width; }
  get height() { return this.canvas.height; }
}
const allFonts = JSON.parse(fs.readFileSync(new URL('fonts.json', root)));
const defaults = vm.runInNewContext(`${source.slice(source.indexOf('  const fonts = {'), source.indexOf('  const fontData = []'))}\nfonts;`, { thumbnail: '', shapeThumbnail: '' });
const baseFont = { ...defaults['minecraft-ten'], ...allFonts.find(f => f.id === 'minecraft-ten') };
const viet = { ...baseFont, ...baseFont.variants.find(f => f.id === 'minecraft-ten-vietnamese') };
async function render(font, res, text, parsed = false) {
  const chars = JSON.parse(fs.readFileSync(new URL(`fonts/${font.id}/characters.json`, root)));
  if (parsed) for (const char of Object.values(chars)) for (const e of char)
    for (const side of Object.keys(e.faces)) e.faces[side] = { uv: e.faces[side] };
  const canvas = new Canvas(1000 * res, 320 * res), ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(await loadImage(fileURLToPath(new URL(`fonts/${font.id}/textures/flat.png`, root))), 0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'source-atop';
  const texture = new Canvas(16, 16), tctx = texture.getContext('2d');
  tctx.fillStyle = '#ff0080'; tctx.fillRect(0, 0, 16, 16);
  tctx.fillStyle = '#0033ff'; tctx.fillRect(0, 0, 8, 8);
  const context = vm.createContext({ fonts: { [font.id]: { ...font, characters: chars } },
    args: { font: font.id, edgeBrightness: 70 }, CanvasFrame, canvas, ctx, texture,
    res, uvScaleW: 62.5 * res, uvScaleH: 20 * res, width: 16 * res, height: 16 * res });
  vm.runInContext(`${helper}\n${paintLoop(text)}`, context);
  return sharp(await canvas.toBuffer('png')).ensureAlpha().raw().toBuffer();
}
for (const res of [1, 2]) {
  const before = await render(viet, res, previous), after = await render(viet, res, source);
  const pixel = (image, x, y) => [...image.subarray(((y * res) * 1000 * res + x * res) * 4, ((y * res) * 1000 * res + x * res) * 4 + 4)];
  for (const [label, x, y] of [['breve front', 300, 214], ['breve top', 300, 193], ['breve bottom', 300, 267], ['dot top', 287, 193]]) {
    const old = pixel(before, x, y), now = pixel(after, x, y);
    assert.equal(old[0], old[1], `${label}: old pixel should be gray`);
    assert.notEqual(now[0], now[1], `${label}: texture missing`);
    assert.equal(now[3], 255);
  }
  assert.notEqual(pixel(after, 70, 267)[0], pixel(after, 70, 267)[1], 'Dollar bottom not painted');
  assert.ok(after.equals(await render(viet, res, source, true)), 'Parsed UV objects differ');
  const oldBase = await render(baseFont, res, previous), newBase = await render(baseFont, res, source);
  assert.ok(oldBase.equals(newBase), 'Original Minecraft Ten rendering changed');
  console.log(`PASS ${res}x: actual Canvas loop paints breve/dot/dollar caps; array/object UV parity; original font pixels unchanged.`);
}
