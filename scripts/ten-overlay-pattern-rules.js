// Exact shape rules and source-preserving style transfer for Ten atlas overlays.
import path from 'node:path';
import sharp from 'sharp';
const W=1000,H=320;
export const lastMetrics = {};
const read = async (ctx,id) => (await sharp(path.join(ctx.source.base,'overlays',id+'.png')).ensureAlpha().raw().toBuffer());
const alias = name => ({'đ':'d','ơ':'o','ư':'u',acute:"'",grave:"'",breve:'^',hookabove:'questionmark',tilde:'~',dotbelow:'.'}[name] ?? name);
const valid = (font,x,y,c) => x>=0&&y>=0&&x<W&&y<H&&font.c[y*W+x]===c;
function tempered(font) {
  const d=classDistances(font),out=Buffer.alloc(W*H*4);
  for(let p=0;p<d.length;p++)if(d[p])out.set(d[p]===1?[255,255,255,255]:d[p]===2?[206,221,236,223]:[255,255,255,48],p*4);
  return out;
}
function glassCustom(font,rects) {
  const d=classDistances(font),out=Buffer.alloc(W*H*4);
  for(let p=0;p<d.length;p++)if(d[p]===1)out.set([255,255,255,255],p*4);
  for(const [x0,y0,x1,y1]of rects)for(const [x,y]of [[x0+4,y0+2],[x0+3,y0+3],[x0+2,y0+4],[x1-3,y1-5],[x1-4,y1-4],[x1-5,y1-3]]) {
    if(x>=0&&y>=0&&x<W&&y<H&&font.c[y*W+x]&&font.c[y*W+x]!==4)out.set([255,255,255,255],(y*W+x)*4);
  }return out;
}
function highlightRowLUT(overlay,flat,w,y0,y1) {
  const rows=[];
  for(let y=y0;y<y1;y++) {
    const counts=new Map();
    for(let x=0;x<w;x++){const i=(y*w+x)*4;if(flat[i]===255&&flat[i+3]===255){const a=overlay[i+3];counts.set(a,(counts.get(a)||0)+1);}}
    rows.push([...counts].sort((a,b)=>b[1]-a[1])[0]?.[0]||0);
  }return rows;
}
function correspondence(ctx) {
  const maps=[];
  for(const target of ctx.target.regions) {
    const name=alias(target.name),candidates=ctx.source.regions.filter(s=>s.name===name);
    if(!candidates.length)continue;
    const t=target.box;
    let best;
    for(const s of candidates)for(const dx of [0,Math.round((s.box[2]-s.box[0]-t[2]+t[0])/2),s.box[2]-s.box[0]-t[2]+t[0]])
      for(const dy of [0,Math.round((s.box[3]-s.box[1]-t[3]+t[1])/2),s.box[3]-s.box[1]-t[3]+t[1]]) {
        const ox=s.box[0]-t[0]+dx,oy=s.box[1]-t[1]+dy;let same=0,total=0;
        for(let y=t[1];y<t[3];y++)for(let x=t[0];x<t[2];x++)if(ctx.target.c[y*W+x]===1){total++;if(valid(ctx.source,x+ox,y+oy,1))same++;}
        const score=same/Math.max(1,total);
        if(!best||score>best.score)best={t,s:s.box,ox,oy,score,name:target.name};
      }
    if(best)maps.push(best);
  }
  return maps;
}
const sourceEnds=[[0,22,62,84],[86,108,148,170],[172,194,242,264]];
const targetEnds=[[0,22,62,84],[86,108,148,170],[183,205,256,278]];
const bandFor=(box,ends)=>ends.find(b=>box[1]>=b[1]&&box[3]<=b[2]);
function transfer(original,ctx,includeCaps=true) {
  const out=Buffer.alloc(W*H*4), covered=new Uint8Array(W*H), maps=correspondence(ctx);
  const copy=(x,y,sx,sy,c)=>{if(!valid(ctx.target,x,y,c)||!valid(ctx.source,sx,sy,c))return;const i=(y*W+x)*4,j=(sy*W+sx)*4;original.copy(out,i,j,j+4);covered[y*W+x]=1;};
  for(const m of maps){const t=m.t;for(let y=t[1];y<t[3];y++)for(let x=t[0];x<t[2];x++)copy(x,y,x+m.ox,y+m.oy,1);
    if(!includeCaps)continue;
    const tb=bandFor(t,targetEnds),sb=bandFor(m.s,sourceEnds);if(!tb||!sb)continue;
    for(const [lo,hi,c]of [[0,1,2],[2,3,3]])for(let y=tb[lo];y<tb[hi];y++)for(let x=t[0];x<t[2];x++)copy(x,y,x+m.ox,sb[lo]+y-tb[lo],c);
  }
  return{out,covered,maps};
}
function classDistances(font) {
  const d=new Uint8Array(W*H);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=y*W+x,c=font.c[i];if(!c||c===4)continue;let best=3;
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)if(!valid(font,x+dx,y+dy,c))best=Math.min(best,Math.max(Math.abs(dx),Math.abs(dy)));
    d[i]=best;
  }return d;
}
function clean(out,font){for(let p=0;p<W*H;p++)if(!font.c[p]||font.c[p]===4||!out[p*4+3])out.fill(0,p*4,p*4+4);return out;}
// Use the original pixel pattern as a stencil, never scale its 1px stroke width.
// Rectangles vary by glyph; regions with new pixels borrow the same source
// surface type. Full source-corresponding areas retain their exact pixels.
function finishStencil(id,original,font,ctx,state) {
  const {out,covered,maps}=state;
  const d=classDistances(font);
  const cap=ctx.source.regions.find(r=>r.name==='a').box;
  const sw=cap[2]-cap[0]-4,sh=18;
  for(const m of maps) {
    const b=m.t;
    for(let y=b[1];y<b[3];y++)for(let x=b[0];x<b[2];x++){
      const p=y*W+x;if(font.c[p]!==1||covered[p])continue;
      const sx=cap[0]+2+((x-b[0])%sw),sy=2+((y-b[1])%sh),j=(sy*W+sx)*4;
      if(original[j+3])original.copy(out,p*4,j,j+4);
    }
  }
  if(id==='glass_old')for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const p=y*W+x;if(!font.c[p]||font.c[p]===4)continue;
    if(d[p]===1)out.set([255,255,255,255],p*4);
    else if(!covered[p]){const sx=cap[0]+2+(x%sw),sy=2+(y%sh),j=(sy*W+sx)*4;if(original[j+3])out.set([255,255,255,255],p*4);}
  }
  return clean(out,font);
}
export async function generate(id,font,ctx) {
  const original=await read(ctx,id);
  if(font===ctx.source){
    if(id==='glass_tempered')return tempered(font);
    return Buffer.from(original);
  }
  let out,state;
  if(id==='glass_tempered')out=tempered(font);
  else if(id==='glass') {
    state=transfer(original,ctx);
    const rects=[...font.regions.map(r=>r.box)];
    const shape=glassCustom(font,rects),d=classDistances(font);
    out=state.out;
    for(let p=0;p<W*H;p++)if(font.c[p]&&font.c[p]!==4){
      if(d[p]===1)out.set([255,255,255,255],p*4);
      else if(!state.covered[p]&&shape[p*4+3])out.set([255,255,255,255],p*4);
    }
  } else if(id.startsWith('texture_highlight_')) {
    state=transfer(original,ctx,false);out=state.out;
    const lut=highlightRowLUT(original,ctx.source.data,W,22,62);
    for(const {box:b}of font.regions)for(let y=b[1];y<b[3];y++)for(let x=b[0];x<b[2];x++){
      const p=y*W+x;if(font.c[p]!==1||state.covered[p])continue;
      const alpha=lut[Math.max(0,Math.min(lut.length-1,y-b[1]))];if(alpha)out.set([255,255,255,alpha],p*4);
    }
  } else if(['glass_old','cracks','tiles'].includes(id)) {
    state=transfer(original,ctx);out=finishStencil(id,original,font,ctx,state);
  } else throw Error('Unsupported pattern overlay: '+id);
  clean(out,font);
  let visible=0,custom=0,covered=0;
  for(let p=0;p<W*H;p++){if(out[p*4+3]){visible++;const x=p%W,y=Math.floor(p/W);if((y>=183&&x>=134)||(y<86&&x>=902&&x<938))custom++;}if(state?.covered[p])covered++;}
  lastMetrics[id]={visiblePixels:visible,customPixels:custom,sourceCorrespondingPixels:covered,sourceRule:id==='glass_tempered'?'exact class-distance, original pixel diff 0':'source-preserving glyph/surface transfer; custom shape-aware completion'};
  return out;
}
