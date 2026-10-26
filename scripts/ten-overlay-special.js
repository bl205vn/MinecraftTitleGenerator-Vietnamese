export async function generate(id, font, ctx) {
  if (id === 'glass_tempered') {
    const { W, H } = ctx, out = Buffer.alloc(W * H * 4), c = font.c;
    const at = (x, y) => x < 0 || x >= W || y < 0 || y >= H ? 0 : c[y * W + x];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (c[i] < 1 || c[i] > 3) continue;
      let d = 3;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++)
        if (at(x + dx, y + dy) !== c[i]) d = Math.min(d, Math.max(Math.abs(dx), Math.abs(dy)));
      out.set(d === 1 ? [255, 255, 255, 255] : d === 2 ? [206, 221, 236, 223] : [255, 255, 255, 48], i * 4);
    }
    return out;
  }
  if (['cartoon', 'shine', 'shine_random'].includes(id)) return (await import('./ten-overlay-reflection-rules.js')).generate(id, font, ctx);
  if (['edge_fade', 'outline_fade', 'bevel', 'bevel_highlight_top', 'bevel_highlight_bottom'].includes(id))
    return (await import('./ten-overlay-edge-rules.js')).generate(id, font, ctx);
  return (await import('./ten-overlay-pattern-rules.js')).generate(id, font, ctx);
}
