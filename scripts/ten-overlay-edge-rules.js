// Geometry-derived edge overlays. Original hand-tuned glyphs are preserved;
// genuinely new glyph regions receive the same palette and a consistent bevel.
// Independent source-rule audit lives in backups/overlay-rule-audit/verify.mjs.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
const cache = new WeakMap();
function local(ctx) { let c = cache.get(ctx); if (!c) cache.set(ctx, c = { originals: new Map(), bevels: new WeakMap() }); return c; }
async function original(id, ctx) {
  const map = local(ctx).originals;
  if (!map.has(id)) map.set(id, await sharp(path.join(ctx.source.base, 'overlays', id + '.png')).ensureAlpha().raw().toBuffer());
  return map.get(id);
}
function at(font, x, y) { return x >= 0 && y >= 0 && x < 1000 && y < 320 ? font.c[y * 1000 + x] : 0; }
function preserveRegions(out, src, font, ctx, scale = 1) {
  const originals = new Map(ctx.source.regions.map(r => [r.name, r]));
  for (const target of font.regions) {
    const donor = originals.get(target.name); if (!donor) continue;
    const [tx,ty,tx1,ty1] = target.box, [sx,sy,sx1,sy1] = donor.box;
    const w = tx1 - tx, h = ty1 - ty;
    if (w !== sx1 - sx || h !== sy1 - sy) continue;
    let same = true;
    for (let y = 0; y < h && same; y++) for (let x = 0; x < w; x++)
      if ((at(font,tx+x,ty+y)===1) !== (at(ctx.source,sx+x,sy+y)===1)) { same = false; break; }
    if (!same) continue;
    for (let y = 0; y < h * scale; y++) for (let x = 0; x < w * scale; x++) {
      if (at(font,tx+Math.floor(x/scale),ty+Math.floor(y/scale)) !== 1) continue;
      const a = (((sy*scale+y)*1000*scale)+(sx*scale+x))*4;
      const b = (((ty*scale+y)*1000*scale)+(tx*scale+x))*4;
      src.copy(out,b,a,a+4);
    }
  }
  return out;
}
function fades(id, font, ctx) {
  const out = Buffer.alloc(1000*320*4), target = font !== ctx.source;
  if (id === 'outline_fade') {
    const profile = [16,46,74,100,126,149,170,189,207,223,237,249];
    const starts = target ? [30,116,216] : [30,116,202];
    for (let y=0;y<320;y++) for (let x=0;x<1000;x++) {
      const i=y*1000+x, start=starts.find(s=>y>=s&&y<s+24);
      if(start===undefined||font.c[i]!==1||font.distance[i]!==1)continue;
      const j=y-start,a=profile[j<12?j:23-j],g=a===16?239:a===126?253:a===207?254:255;
      out.set([g,g,g,a],i*4);
    }
  } else {
    const profile = [255,246,236,224,212,197,182,167,151,135,120,105,90,77,64,52,41,32,24,17,12,7];
    const bands = target ? [[0,22],[86,108],[183,205],[62,84],[148,170],[256,278]]
      : [[0,22],[86,108],[172,194],[62,84],[148,170],[242,264]];
    for(let k=0;k<bands.length;k++){
      const [y0,y1]=bands[k],top=k<3,c=top?2:3;
      for(let y=y0;y<y1;y++)for(let x=0;x<1000;x++){
        if(at(font,x,y)!==c)continue;
        const j=top?y-y0:y1-1-y;
        if(j===0||at(font,x-1,y)!==c||at(font,x+1,y)!==c)out.set([255,255,255,profile[j]],(y*1000+x)*4);
      }
    }
  }
  return out;
}
function consistentBevel(font, ctx) {
  const store=local(ctx).bevels;if(store.has(font))return store.get(font);
  const W=4000,H=1280,out=Buffer.alloc(W*H*4);
  const white=(x,y)=>x>=0&&y>=0&&x<W&&y<H&&at(font,Math.floor(x/4),Math.floor(y/4))===1;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    if(!white(x,y))continue;
    let best=Infinity,colors=new Set();
    for(let dy=-5;dy<=5;dy++)for(let dx=-5;dx<=5;dx++){
      const d=dx*dx+dy*dy;if(d>best||white(x+dx,y+dy))continue;
      const c=Math.abs(dx)===Math.abs(dy)?164:Math.abs(dx)>Math.abs(dy)?dx<0?110:98:dy<0?231:208;
      if(d<best){best=d;colors=new Set([c]);}else colors.add(c);
    }
    if(best!==Infinity){const c=colors.size===1?[...colors][0]:164;out.set([c,c,c,255],(y*W+x)*4);}
  }
  store.set(font,out);return out;
}
/** Return RGBA Buffer: 1000x320 fades, 4000x1280 bevel variants. */
export async function generate(id, font, ctx) {
  if(!['edge_fade','outline_fade','bevel','bevel_highlight_top','bevel_highlight_bottom'].includes(id))throw Error('Unsupported edge rule '+id);
  const src=await original(id,ctx);
  // Exact source return is preservation, NOT a claim that hand-edited source
  // bevels are reproduced by one uniform local algorithm. See audit metrics.
  if(font===ctx.source)return Buffer.from(src);
  if(id==='outline_fade'){
    const out=fades(id,font,ctx);
    // Horned vowels use the first-row U/O body lighting, not the $/@ row.
    // The first 28x40 pixels are identical to those base letters; the extra
    // two columns are only a horn join (above the fade's lit center).
    for(const [name,base]of [['ư','u'],['ơ','o']]){
      const body=font.regions.find(r=>r.name===name&&r.box[3]-r.box[1]===40);
      const donor=ctx.source.regions.find(r=>r.name===base);
      if(!body||!donor)continue;
      const [tx,ty,tx1,ty1]=body.box,[sx,sy,sx1,sy1]=donor.box;
      for(let y=ty;y<ty1;y++)for(let x=tx;x<tx1;x++){
        const i=(y*1000+x)*4;out.fill(0,i,i+4);
        if(x-tx>=sx1-sx||at(font,x,y)!==1)continue;
        const j=((sy+y-ty)*1000+sx+x-tx)*4;
        src.copy(out,i,j,j+4);
      }
    }
    return out;
  }
  if(id==='edge_fade'){
    const out=fades(id,font,ctx);
    // Preserve the original +/-1 alpha dithering wherever corresponding caps exist.
    for(let y=0;y<320;y++)for(let x=0;x<1000;x++){
      const i=(y*1000+x)*4;if(!out[i+3])continue;
      const sy=y>=256?y-14:y>=183&&y<205?y-11:y;
      const j=(sy*1000+x)*4;
      if(at(ctx.source,x,sy)===at(font,x,y)&&src[j+3])src.copy(out,i,j,j+4);
    }
    return out;
  }
  const full=consistentBevel(font,ctx),out=Buffer.from(full);
  if(id!=='bevel'){
    out.fill(0);
    const want=id==='bevel_highlight_top'?231:208;
    for(let y=0;y<1280;y++)for(let x=0;x<4000;x++){
      const i=(y*4000+x)*4;if(!full[i+3])continue;
      if(full[i]===want){out.set([want,want,want,255],i);continue;}
      if(full[i]!==164)continue;
      let adjacent=false;
      for(const[dx,dy]of [[0,-1],[0,1],[-1,0],[1,0]]){
        const xx=x+dx,yy=y+dy;if(xx<0||xx>=4000||yy<0||yy>=1280)continue;
        const q=(yy*4000+xx)*4;if(full[q+3]&&full[q]===want)adjacent=true;
      }
      if(adjacent)out.set(want===231?[164,164,164,255]:[191,191,191,12],i);
    }
  }
  preserveRegions(out,src,font,ctx,4);
  // Guarantee no high-resolution export fringes leak outside target white.
  for(let y=0;y<1280;y++)for(let x=0;x<4000;x++)if(at(font,Math.floor(x/4),Math.floor(y/4))!==1)out.fill(0,(y*4000+x)*4,(y*4000+x)*4+4);
  return out;
}
