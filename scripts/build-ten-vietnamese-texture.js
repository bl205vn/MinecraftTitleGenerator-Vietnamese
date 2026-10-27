// One texture at a time. No synthesized colors, painting, blending, or atlas edits.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import sharp from 'sharp';
import { loadContext, W, H } from './ten-overlay-context.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const review = path.join(root, 'backups/ten-texture-review');
const progressPath = path.join(root, 'scripts/ten-texture-progress.json');
const command = process.argv[2], id = process.argv[3];
assert.ok(['next', 'prepare', 'complete', 'verify'].includes(command));
const hash = data => createHash('sha256').update(data).digest('hex');
const readJSON = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJSON = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
const ctx = await loadContext(root);
const files = fs.readdirSync(path.join(ctx.source.base, 'textures')).filter(f => f.endsWith('.png')).sort();
const ids = files.map(f => f.slice(0, -4));
const srcFile = name => path.join(ctx.source.base, 'textures', name + '.png');
const outFile = name => path.join(ctx.target.base, 'textures', name + '.png');
const resultFile = name => path.join(review, name + '.json');
const sourceMetadata = readJSON(path.join(ctx.source.base, 'textures.json'));
const metaFile = path.join(ctx.target.base, 'textures.json');
const flatHash = hash(ctx.target.raw), sourceFlatHash = hash(ctx.source.raw);
fs.mkdirSync(review, { recursive: true });

function protectedFiles() {
  const output = {};
  const walk = dir => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f); else output[path.relative(root, f).replaceAll('\\', '/')] = hash(fs.readFileSync(f));
  } };
  for (const font of [ctx.source, ctx.target]) for (const folder of ['characters', 'overlays']) walk(path.join(font.base, folder));
  walk(path.join(ctx.source.base, 'textures'));
  for (const f of [path.join(root, 'fonts.json'), outFile('flat'), path.join(ctx.target.base, 'characters.json')])
    output[path.relative(root, f).replaceAll('\\', '/')] = hash(fs.readFileSync(f));
  return output;
}
let progress;
if (fs.existsSync(progressPath)) progress = readJSON(progressPath);
else {
  fs.copyFileSync(metaFile, path.join(review, 'textures.before.json'));
  writeJSON(path.join(review, 'protected-files.json'), protectedFiles());
  progress = { version: 1, flatSHA256: flatHash, sourceFlatSHA256: sourceFlatHash, total: ids.length, current: null, completed: {} };
  writeJSON(progressPath, progress);
}
assert.equal(progress.flatSHA256, flatHash, 'Vietnamese Flat changed; stop and review');
assert.equal(progress.sourceFlatSHA256, sourceFlatHash, 'Source Flat changed; stop and review');
function validCompleted(name) {
  const r = progress.completed[name];
  if (!r) return false;
  assert.equal(hash(fs.readFileSync(srcFile(name))), r.sourceSHA256, name + ': completed source changed');
  assert.equal(hash(fs.readFileSync(outFile(name))), r.outputSHA256, name + ': completed output changed');
  return true;
}
function ledger() {
  const lines = ['# Minecraft Ten Vietnamese textures', '',
    'Each texture is processed and visually reviewed separately. Completed files are skipped after SHA-256 checks.',
    'All output pixels are copied from the corresponding original texture, using the unchanged Vietnamese atlas layout.',
    'Source-authored transparent cutouts/alpha are preserved inside the glyphs (user instruction 2026-10-27).',
    'No new colors, strokes, effects, alpha silhouettes, models, or overlays are authored.', '',
    'Commands (repository root):', '```powershell', 'node scripts/build-ten-vietnamese-texture.js next',
    'node scripts/build-ten-vietnamese-texture.js prepare TEXTURE_ID',
    'node scripts/build-ten-vietnamese-texture.js complete TEXTURE_ID "Visual review note"',
    'node scripts/build-ten-vietnamese-texture.js verify', '```', '',
    'Prepare saves a candidate and one-texture review image under `backups/ten-texture-review/`.',
    'Complete installs only that reviewed candidate and registers its original author metadata.',
    'The next texture cannot start while a candidate is awaiting review.',
    'Original third-row faces/bottom caps move down 14px; top caps move down 11px.',
    'New Đ, Ơ/Ư and marks reuse D, O/U and punctuation pixels respectively; top/bottom caps retain their surface class.',
    'Each compressed donor map is saved as `TEXTURE.donors.i32.gz` (little-endian Int32 source pixel index; -1 means transparent).',
    'This is a pixel-copy adaptation, not reconstruction of the original author\'s procedural recipe.',
    'Offline atlas inspection does not establish live Blockbench rendering. Thumbnails require the project compile workflow.', '',
    `Completed: ${Object.keys(progress.completed).length}/${ids.length}`, '',
    ...ids.map(name => `- [${progress.completed[name] ? 'x' : ' '}] \`${name}.png\`${progress.current === name ? ' — awaiting review' : ''}`)];
  fs.writeFileSync(path.join(root, 'scripts/TEN_VIETNAMESE_TEXTURES.md'), lines.join('\n') + '\n');
}
function registerCompleted() {
  const metadata = readJSON(metaFile), done = new Set(Object.keys(progress.completed)), textures = {};
  for (const [parent, entry] of Object.entries(sourceMetadata.textures)) {
    const { variants, ...base } = entry;
    if (done.has(parent)) {
      textures[parent] = parent === 'flat' ? metadata.textures.flat : { ...base };
      const selected = Object.fromEntries(Object.entries(variants ?? {}).filter(([name]) => done.has(name)));
      if (Object.keys(selected).length) textures[parent].variants = selected;
    } else {
      for (const [name, variant] of Object.entries(variants ?? {})) if (done.has(name))
        textures[name] = { ...variant, author: variant.author ?? base.author };
    }
  }
  // Flat is always the canonical first entry, even before its turn in the queue.
  metadata.textures = { flat: metadata.textures.flat, ...textures };
  writeJSON(metaFile, metadata);
}

// This map is derived from the two Flat atlases only. It never reads another texture.
function buildDonors() {
  const map = new Int32Array(W * H).fill(-1), exact = new Uint8Array(W * H);
  const at = (font, x, y) => x >= 0 && x < W && y >= 0 && y < H ? font.c[y * W + x] : 0;
  const groups = [
    { name: 'đ', x0: 902, x1: 938, top: 0, front: 22, end: 62, donor: [120,22,148,62], band: [0,62] },
    { name: 'ư', x0: 134, x1: 174, top: 183, front: 216, end: 256, donor: [640,22,668,62], band: [0,62] },
    { name: 'ơ', x0: 176, x1: 216, top: 183, front: 216, end: 256, donor: [456,22,484,62], band: [0,62] },
    { name: 'acute', x0: 217, x1: 233, top: 183, front: 208, end: 220, donor: [528,108,564,148], band: [86,148] },
    { name: 'grave', x0: 235, x1: 251, top: 183, front: 208, end: 220, donor: [566,108,602,148], band: [86,148] },
    { name: 'hookabove', x0: 253, x1: 271, top: 183, front: 208, end: 222, donor: [604,108,632,136], band: [86,148] },
    { name: 'tilde', x0: 273, x1: 299, top: 183, front: 208, end: 219, donor: [920,108,944,120], band: [86,148] },
    { name: 'dotbelow', x0: 301, x1: 311, top: 183, front: 247, end: 256, donor: [648,136,660,148], band: [86,148] },
    { name: 'breve', x0: 313, x1: 333, top: 183, front: 208, end: 220, donor: [920,108,944,120], band: [86,148] },
  ];
  const counts = {};
  function set(p, sx, sy, isExact, label) {
    assert.equal(at(ctx.source,sx,sy), ctx.target.c[p], `Donor class mismatch at ${p % W},${Math.floor(p / W)}`);
    map[p] = sy * W + sx; exact[p] = isExact ? 1 : 0;
    counts[label] = (counts[label] ?? 0) + 1;
  }
  function nearest(x,y,sx,sy,box,c) {
    let best = Infinity, found;
    for (let yy=box[1];yy<box[3];yy++) for(let xx=box[0];xx<box[2];xx++) {
      if(at(ctx.source,xx,yy)!==c)continue;
      let cost=(xx-sx)**2+(yy-sy)**2;
      // Prefer donors with the same edge directions, without painting edges.
      for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]])
        if((at(ctx.target,x+dx,y+dy)===c)!==(at(ctx.source,xx+dx,yy+dy)===c))cost+=10;
      if(cost<best){best=cost;found=[xx,yy];}
    }
    assert.ok(found, 'No same-surface donor');return found;
  }
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const p=y*W+x,c=ctx.target.c[p];if(!c)continue;
    let sy=y<172?y:y>=183&&y<205?y-11:y>=208?y-14:-1;
    if(at(ctx.source,x,sy)===c){set(p,x,sy,true,'unchanged or relocated original');continue;}
    if(c===4){set(p,0,266,false,'border sample');continue;}
    const g=groups.find(g=>x>=g.x0&&x<g.x1&&y>=g.top&&y<(g.top===0?84:278));
    assert.ok(g, `Unmapped atlas surface at ${x},${y}; do not paint a fallback`);
    const [dx,dy,dx1,dy1]=g.donor,lx=x-g.x0;
    let sx,box;
    if(c===2||c===3){
      sy=g.band[c===2?0:1]+(c===2?y-g.top:y-(g.top===0?62:256));
      sx=dx+(lx%(dx1-dx));
      box=[dx,sy,dx1,sy+1];
      // Punctuation top/bottom strips can be narrower than their front box.
      if(!Array.from({length:dx1-dx},(_,i)=>at(ctx.source,dx+i,sy)).includes(c))box=[0,sy,W,sy+1];
    }else if(g.name==='đ'){
      sx=dx+(lx<4?lx:lx<16?(y>=38&&y<46?lx:lx-4):lx<24?12+Math.floor((lx-16)/2):lx-8);
      sy=y;box=g.donor;
    }else if(g.name==='ư'||g.name==='ơ'){
      sx=dx+Math.min(27,lx);sy=y>=216?dy+y-216:dy+y-205;box=g.donor;
    }else{
      // Crop a donor at native pixel density; never shrink its material motifs.
      sx=dx+Math.floor(((dx1-dx)-(g.x1-g.x0))/2)+lx;
      sy=dy+y-g.front;box=g.donor;
    }
    if(at(ctx.source,sx,sy)!==c)[sx,sy]=nearest(x,y,sx,sy,box,c);
    set(p,sx,sy,false,g.name+(c===1?' face':c===2?' top':' bottom'));
  }
  return {map,exact,counts,groups};
}

if(command==='next'){
  for(const name of Object.keys(progress.completed))validCompleted(name);
  ledger();console.log(JSON.stringify({completed:Object.keys(progress.completed).length,total:ids.length,next:progress.current??ids.find(name=>!progress.completed[name])??null}));
}else if(command==='prepare'){
  assert.ok(ids.includes(id),'Unknown texture');
  if(validCompleted(id)){console.log(JSON.stringify({id,status:'skipped_completed'}));process.exit(0);}
  assert.ok(!progress.current||progress.current===id, `Finish ${progress.current} before analysing another texture`);
  assert.equal(id,ids.find(name=>!progress.completed[name]),'Process the next uncompleted texture in alphabetical order');
  progress.current=id;writeJSON(progressPath,progress);ledger();
  const originalBytes=fs.readFileSync(srcFile(id));
  const {data:source,info}=await sharp(originalBytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  // Upstream Cracked uses 3000x960 despite README listing 1x/2x/4x.
  // Preserve the actual Ten resolution, as requested, without resampling it.
  const s=info.width/W;assert.ok([1,2,3,4].includes(s));assert.equal(info.height,H*s);
  const {map,exact,counts,groups}=buildDonors();
  // Discover exact row-periodic materials independently for each face class.
  // Each recorded tile position is an actual source pixel, never a new color.
  const repeats={};
  for(const c of [1,2,3])for(const period of [1,2,4,8,12,16,20,24,28,32,40,48,64,80,128]){
    let matches=true;const samples=new Map();
    for(let y=0;y<84&&matches;y++)for(let x=0;x<900&&matches;x++){
      if(ctx.source.c[y*W+x]!==c)continue;
      // Cutouts are authored exceptions, not a different material color.
      if(!source[((y*s)*info.width+x*s)*4+3])continue;
      const key=y*period+x%period,previous=samples.get(key);
      if(previous===undefined){samples.set(key,y*W+x);continue;}
      for(let yy=0;yy<s&&matches;yy++)for(let xx=0;xx<s;xx++){
        const a=((y*s+yy)*info.width+x*s+xx)*4;
        const b=((Math.floor(previous/W)*s+yy)*info.width+(previous%W)*s+xx)*4;
        if(source.readUInt32LE(a)!==source.readUInt32LE(b)){matches=false;break;}
      }
    }
    if(matches){repeats[c]={period,samples};break;}
  }
  const horizontalBands=repeats[1]?.period===1;
  const edgeCopy=process.argv.includes('--edges');
  if(edgeCopy&&!repeats[1]){
    const dirs=[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
    const profile=(font,x,y)=>dirs.map(([dx,dy])=>{
      for(let n=1;n<=4;n++){const xx=x+dx*n,yy=y+dy*n;if(xx<0||xx>=W||yy<0||yy>=H||font.c[yy*W+xx]!==1)return n;}return 5;
    });
    const donors=groups.map(g=>{
      const a=[],lo=g.donor[1]<62?22:108,hi=g.donor[1]<62?62:148;
      for(let y=lo;y<hi;y++)for(let x=0;x<(lo===22?900:980);x++)if(ctx.source.c[y*W+x]===1)a.push({x,y,p:profile(ctx.source,x,y)});
      return {g,a};
    });
    for(let p=0;p<map.length;p++){
      if(exact[p]||ctx.target.c[p]!==1)continue;
      const x=p%W,y=Math.floor(p/W),entry=donors.find(({g})=>x>=g.x0&&x<g.x1&&y>=g.top&&y<(g.top===0?84:278));
      if(!entry)continue;
      const tp=profile(ctx.target,x,y),sx=map[p]%W,sy=Math.floor(map[p]/W);
      let score=Infinity,best=map[p];
      for(const d of entry.a){
        const edge=tp.reduce((sum,v,i)=>sum+Math.abs(v-d.p[i]),0);
        const cost=edge*100+Math.abs(d.y-sy)*12+Math.abs(d.x-sx)*0.03;
        if(cost<score){score=cost;best=d.y*W+d.x;}
      }
      map[p]=best;
    }
  }
  for(let p=0;p<map.length;p++){
    if(exact[p]||map[p]<0)continue;
    const c=ctx.target.c[p],repeat=repeats[c];if(!repeat)continue;
    const x=p%W,y=Math.floor(p/W),g=groups.find(g=>x>=g.x0&&x<g.x1&&y>=g.top&&y<(g.top===0?84:278));
    if(!g)continue;
    let sx=g.donor[0]+x-g.x0,sy;
    if(c===2)sy=y-g.top;
    else if(c===3)sy=62+y-(g.top===0?62:256);
    else if(g.name==='đ')sy=y;
    else if(g.name==='ư'||g.name==='ơ')sy=22+y-(y>=216?216:205);
    else sy=(g.name==='dotbelow'?62-(g.end-g.front):22)+y-g.front;
    const q=repeat.samples.get(sy*repeat.period+sx%repeat.period);
    if(q!==undefined)map[p]=q;
  }
  const materialMarks=process.argv.includes('--material-marks');
  if(materialMarks&&!repeats[1])for(let y=208;y<223;y++)for(let x=217;x<333;x++){
    const p=y*W+x;if(ctx.target.c[p]!==1)continue;
    const g=groups.find(g=>x>=g.x0&&x<g.x1);if(!g)continue;
    map[p]=(22+y-g.front)*W+270+(x-g.x0)%12;
  }
  const materialCaps=process.argv.includes('--material-caps');
  if(materialCaps)for(let p=0;p<map.length;p++){
    const c=ctx.target.c[p];if(exact[p]||![2,3].includes(c)||repeats[c])continue;
    const x=p%W,y=Math.floor(p/W),g=groups.find(g=>x>=g.x0&&x<g.x1&&y>=g.top&&y<(g.top===0?84:278));if(!g)continue;
    const sx=c===2?30+(x-g.x0)%28:270+(x-g.x0)%12,sy=c===2?y-g.top:62+y-(g.top===0?62:256);
    assert.equal(ctx.source.c[sy*W+sx],c);map[p]=sy*W+sx;
  }
  const capEdges=process.argv.includes('--cap-edges');
  if(capEdges)for(let p=0;p<map.length;p++){
    const c=ctx.target.c[p];if(exact[p]||![2,3].includes(c))continue;
    const x=p%W,y=Math.floor(p/W),g=groups.find(g=>x>=g.x0&&x<g.x1&&y>=g.top&&y<(g.top===0?84:278));if(!g)continue;
    let left=0,right=0;while(left<3&&x-left>0&&ctx.target.c[p-left-1]===c)left++;while(right<3&&x+right+1<W&&ctx.target.c[p+right+1]===c)right++;
    const sx=left<3?270+left:right<3?281-right:274+(x-g.x0)%4,sy=c===2?y-g.top:62+y-(g.top===0?62:256);
    assert.equal(ctx.source.c[sy*W+sx],c);map[p]=sy*W+sx;
  }
  const output=Buffer.alloc(source.length),palette=new Set(),border=new Set();
  let nativeDonors;
  const rectangularEdgeCopy=process.argv.includes('--rect-edges');
  if(rectangularEdgeCopy){
    nativeDonors=new Int32Array(info.width*info.height).fill(-1);
    const radius=Math.ceil(1.5*s),dirs=[[-1,0],[1,0],[0,-1],[0,1]];
    for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
      const p=Math.floor(y/s)*W+Math.floor(x/s);if(exact[p]||ctx.target.c[p]!==1)continue;
      const xx=Math.floor(x/s),yy=Math.floor(y/s),g=groups.find(g=>xx>=g.x0&&xx<g.x1&&yy>=g.top&&yy<(g.top===0?84:278));
      if(!g)continue;
      const d=dirs.map(([dx,dy])=>{for(let n=1;n<=radius;n++){const nx=x+dx*n,ny=y+dy*n;if(nx<0||nx>=info.width||ny<0||ny>=info.height||ctx.target.c[Math.floor(ny/s)*W+Math.floor(nx/s)]!==1)return n;}return radius+1;});
      if(d.every(v=>v>radius)){
        const q=map[p],ox=(q%W)*s+x%s,oy=Math.floor(q/W)*s+y%s;
        const sourceEdge=dirs.some(([dx,dy])=>{for(let n=1;n<=radius;n++){const nx=ox+dx*n,ny=oy+dy*n;if(nx<0||nx>=info.width||ny<0||ny>=info.height||ctx.source.c[Math.floor(ny/s)*W+Math.floor(nx/s)]!==1)return true;}return false;});
        if(!sourceEdge)continue;
      }
      let sx=276*s,sy=22*s+(y-g.front*s);
      if(g.name==='ư'||g.name==='ơ')sy=22*s+y-(y>=216*s?216:205)*s;
      if(g.name==='dotbelow')sy=62*s-(g.end-g.front)*s+y-g.front*s;
      sy=Math.max(22*s+radius,Math.min(62*s-radius-1,sy));
      if(d[0]<=radius)sx=270*s+d[0]-1;else if(d[1]<=radius)sx=282*s-d[1];
      if(d[2]<=radius)sy=22*s+d[2]-1;else if(d[3]<=radius)sy=62*s-d[3];
      nativeDonors[y*info.width+x]=sy*info.width+sx;
    }
  }
  if(edgeCopy&&s>1&&!repeats[1]){
    nativeDonors=new Int32Array(info.width*info.height).fill(-1);
    const cap=5*s,dirs=[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
    const profile=(font,x,y)=>dirs.map(([dx,dy])=>{
      for(let n=1;n<cap;n++){const xx=x+dx*n,yy=y+dy*n;if(xx<0||xx>=info.width||yy<0||yy>=info.height||font.c[Math.floor(yy/s)*W+Math.floor(xx/s)]!==1)return n;}return cap;
    });
    const banks=[new Map(),new Map()];
    for(let band=0;band<2;band++)for(let y=(band?108:22)*s;y<(band?148:62)*s;y++)for(let x=0;x<(band?980:900)*s;x++){
      if(ctx.source.c[Math.floor(y/s)*W+Math.floor(x/s)]!==1)continue;
      const pr=profile(ctx.source,x,y),key=pr.join(',');
      if(!banks[band].has(key))banks[band].set(key,{pr,pixels:[]});banks[band].get(key).pixels.push(y*info.width+x);
    }
    const cache=[new Map(),new Map()];
    for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
      const p=Math.floor(y/s)*W+Math.floor(x/s);if(exact[p]||ctx.target.c[p]!==1)continue;
      const q=map[p],sx=(q%W)*s+x%s,sy=Math.floor(q/W)*s+y%s,band=sy>=108*s?1:0;
      const pr=profile(ctx.target,x,y),key=pr.join(',');let list=cache[band].get(key);
      if(!list){
        let min=Infinity;list=[];
        for(const entry of banks[band].values()){
          const cost=pr.reduce((sum,v,i)=>sum+Math.abs(v-entry.pr[i]),0);
          if(cost<min){min=cost;list=[entry];}else if(cost===min)list.push(entry);
        }
        cache[band].set(key,list);
      }
      let best=-1,min=Infinity;
      for(const entry of list)for(const v of entry.pixels){
        const score=Math.abs(Math.floor(v/info.width)-sy)*12+Math.abs(v%info.width-sx)*0.03;
        if(score<min){min=score;best=v;}
      }
      assert.ok(best>=0);nativeDonors[y*info.width+x]=best;
    }
  }
  let sourceMissing=0,sourceExtra=0,sourcePartial=0,visible=0,originalCopied=0;
  const missingExamples=[];
  for(let yy=0;yy<info.height;yy++)for(let xx=0;xx<info.width;xx++){
    const i=(yy*info.width+xx)*4,p=Math.floor(yy/s)*W+Math.floor(xx/s),a=source[i+3];
    if(a)palette.add(source.readUInt32LE(i));
    if(ctx.source.c[p]&&!a){sourceMissing++;if(missingExamples.length<32)missingExamples.push([xx,yy]);}
    if(!ctx.source.c[p]&&a)sourceExtra++;
    if(a&&a!==255)sourcePartial++;
    if(ctx.source.c[p]===4&&a)border.add(source.readUInt32LE(i));
  }
  // Keep source exceptions that fall inside an existing displayed glyph UV.
  // Stray source pixels in unused atlas gaps are not transferred into glyphs.
  let sourceExtraReferenced=0;
  if(sourceExtra)for(const r of ctx.source.regions){
    const t=ctx.target.regions.find(t=>t.name===r.name&&t.box[2]-t.box[0]===r.box[2]-r.box[0]&&t.box[3]-t.box[1]===r.box[3]-r.box[1]);
    if(!t)continue;
    for(let y=r.box[1];y<r.box[3];y++)for(let x=r.box[0];x<r.box[2];x++){
      const q=y*W+x,p=(t.box[1]+y-r.box[1])*W+t.box[0]+x-r.box[0];
      if(ctx.source.c[q]||ctx.target.c[p]||map[p]>=0)continue;
      let n=0;for(let yy=0;yy<s;yy++)for(let xx=0;xx<s;xx++)if(source[((y*s+yy)*info.width+x*s+xx)*4+3])n++;
      if(n){map[p]=q;exact[p]=1;sourceExtraReferenced+=n;}
    }
  }
  writeJSON(resultFile(id),{id,status:'analysed',size:[info.width,info.height],sourceSHA256:hash(originalBytes),flatSHA256:flatHash,
    sourceMissingPixels:sourceMissing,sourceExtraPixels:sourceExtra,sourcePartialAlphaPixels:sourcePartial,missingExamples,
    paletteColors:palette.size,borderColors:border.size,exactMaterialRowPeriods:Object.fromEntries(Object.entries(repeats).map(([c,r])=>[c,r.period]))});
  for(let yy=0;yy<info.height;yy++)for(let xx=0;xx<info.width;xx++){
    const i=(yy*info.width+xx)*4,p=Math.floor(yy/s)*W+Math.floor(xx/s);
    if(map[p]<0)continue;
    const q=map[p],native=nativeDonors?.[yy*info.width+xx];
    const j=native>=0?native*4:((Math.floor(q/W)*s+yy%s)*info.width+(q%W)*s+xx%s)*4;
    source.copy(output,i,j,j+4);if(source[j+3])visible++;if(exact[p])originalCopied++;
  }
  // A source shape mismatch is evidence requiring review, never permission to invent pixels.
  const report={id,status:'prepared',size:[info.width,info.height],scale:s,sourceSHA256:hash(originalBytes),flatSHA256:flatHash,
    sourceResolutionOutsideReadmeList:s===3,
    paletteColors:palette.size,borderColors:border.size,horizontalBands,exactMaterialRowPeriods:Object.fromEntries(Object.entries(repeats).map(([c,r])=>[c,r.period])),sourceMissingPixels:sourceMissing,sourceExtraPixels:sourceExtra,sourceExtraReferenced,sourceExtraOutsideGlyphUV:sourceExtra-sourceExtraReferenced,sourcePartialAlphaPixels:sourcePartial,
    visiblePixels:visible,originalCorrespondencePixels:originalCopied,newSurfacePixels:visible-originalCopied,
    transfer:'RGBA pixel copies only, including authored source cutouts/alpha; Vietnamese atlas layout; same source surface class',edgeCopy,rectangularEdgeCopy,materialMarks,materialCaps,capEdges,logicalDonorCounts:counts,
    actualBlockbenchVerified:false,visualReview:null};
  const candidate=path.join(review,id+'.candidate.png');
  if(id==='flat'){
    assert.ok(output.every((v,i)=>i%4===3?v===ctx.target.data[i]:!ctx.target.data[i-i%4+3]||v===ctx.target.data[i]),'Flat correspondence mismatch');
    fs.copyFileSync(outFile('flat'),candidate);
  }else await sharp(output,{raw:{width:info.width,height:info.height,channels:4}}).png().toFile(candidate);
  const saved=await sharp(candidate).ensureAlpha().raw().toBuffer();
  if(id!=='flat')assert.ok(saved.equals(output),'Saved pixels changed');
  report.outputSHA256=hash(fs.readFileSync(candidate));
  fs.writeFileSync(path.join(review,id+'.donors.i32.gz'),gzipSync(Buffer.from(map.buffer)));
  report.donorMapSHA256=hash(Buffer.from(map.buffer));
  if(nativeDonors){const bytes=Buffer.from(nativeDonors.buffer);fs.writeFileSync(path.join(review,id+'.native-donors.i32.gz'),gzipSync(bytes));report.nativeDonorMapSHA256=hash(bytes);}
  writeJSON(resultFile(id),report);
  // Source and candidate are displayed together, for this ONE texture only.
  const preview=sharp({create:{width:1000,height:1060,channels:4,background:'#30343c'}});
  const sourceView=await sharp(originalBytes).resize(1000,320,{kernel:'nearest'}).png().toBuffer();
  const targetView=await sharp(candidate).resize(1000,320,{kernel:'nearest'}).png().toBuffer();
  const detail=await sharp(candidate).extract({left:134*s,top:183*s,width:200*s,height:95*s}).resize(800,380,{kernel:'nearest'}).png().toBuffer();
  const d=await sharp(candidate).extract({left:902*s,top:0,width:36*s,height:84*s}).resize(144,336,{kernel:'nearest'}).png().toBuffer();
  const title=Buffer.from(`<svg width="1000" height="1060"><style>text{font:14px sans-serif;fill:white}</style><text x="5" y="16">${id}: SOURCE (top), VIETNAMESE (middle), new glyph details (bottom)</text></svg>`);
  await preview.composite([{input:sourceView,left:0,top:20},{input:targetView,left:0,top:340},{input:detail,left:0,top:680},{input:d,left:830,top:700},{input:title,left:0,top:0}]).png().toFile(path.join(review,id+'.review.png'));
  console.log(JSON.stringify({id,size:report.size,palette:report.paletteColors,periods:report.exactMaterialRowPeriods,sourceMissing,sourceExtra,sourcePartial,borderColors:border.size}));
}else if(command==='complete'){
  assert.ok(ids.includes(id));if(validCompleted(id)){console.log(JSON.stringify({id,status:'skipped_completed'}));process.exit(0);}
  assert.equal(progress.current,id);const note=process.argv[4];assert.ok(note&&note.length>10,'Record actual visual review before completion');
  const r=readJSON(resultFile(id)),candidate=path.join(review,id+'.candidate.png');
  assert.equal(r.flatSHA256,flatHash);assert.equal(r.sourceSHA256,hash(fs.readFileSync(srcFile(id))));
  assert.equal(r.outputSHA256,hash(fs.readFileSync(candidate)));
  if(id!=='flat'){
    assert.ok(!fs.existsSync(outFile(id)), 'Output already exists without completed record; do not overwrite');
    fs.copyFileSync(candidate,outFile(id));
  }
  r.status='completed';r.visualReview=note;r.completedAt=new Date().toISOString();writeJSON(resultFile(id),r);
  progress.completed[id]={sourceSHA256:r.sourceSHA256,outputSHA256:r.outputSHA256,visualReview:note};
  progress.current=null;writeJSON(progressPath,progress);registerCompleted();ledger();
  console.log(JSON.stringify({id,status:'completed',completed:Object.keys(progress.completed).length,total:ids.length,next:ids.find(name=>!progress.completed[name])??null}));
}else{
  const before=readJSON(path.join(review,'protected-files.json'));
  assert.deepEqual(protectedFiles(),before,'Protected source, Flat, models or overlays changed');
  const checks=[];
  // Verification reads completed files sequentially; it does not re-analyse their style.
  for(const name of ids.filter(name=>progress.completed[name])){
    validCompleted(name);const r=readJSON(resultFile(name));
    const original=await sharp(srcFile(name)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const target=await sharp(outFile(name)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    assert.equal(target.info.width,original.info.width);assert.equal(target.info.height,original.info.height);
    const s=target.info.width/W,palette=new Set();for(let i=0;i<original.data.length;i+=4)if(original.data[i+3])palette.add(original.data.readUInt32LE(i));
    const donors=gunzipSync(fs.readFileSync(path.join(review,name+'.donors.i32.gz')));
    assert.equal(hash(donors),r.donorMapSHA256);
    const native=r.nativeDonorMapSHA256?gunzipSync(fs.readFileSync(path.join(review,name+'.native-donors.i32.gz'))):null;
    if(native)assert.equal(hash(native),r.nativeDonorMapSHA256);
    let visible=0;
    for(let y=0;y<target.info.height;y++)for(let x=0;x<target.info.width;x++){
      const i=(y*target.info.width+x)*4,p=Math.floor(y/s)*W+Math.floor(x/s);
      const q=donors.readInt32LE(p*4);
      if(q<0){assert.equal(target.data[i+3],0,name+': pixel outside atlas');continue;}
      assert.equal(ctx.source.c[q],ctx.target.c[p]);
      const nativeIndex=native?.readInt32LE(i);
      const j=nativeIndex>=0?nativeIndex*4:((Math.floor(q/W)*s+y%s)*target.info.width+(q%W)*s+x%s)*4;
      assert.equal(target.data[i+3],original.data[j+3],name+': source alpha was modified');
      if(target.data[i+3]){
        visible++;assert.ok(palette.has(target.data.readUInt32LE(i)),name+': invented RGBA');
        assert.equal(target.data.readUInt32LE(i),original.data.readUInt32LE(j),name+': pixel differs from recorded source donor');
      }
    }
    checks.push({id:name,visible,alphaMismatch:0,newRGBA:0,sourceSHA256:r.sourceSHA256,outputSHA256:r.outputSHA256});
  }
  const report={completed:checks.length,total:ids.length,pending:progress.current,allCompleted:checks.length===ids.length&&!progress.current,protectedInputsUnchanged:true,actualBlockbenchVerified:false,checks};
  writeJSON(path.join(review,'verification.json'),report);ledger();console.log(JSON.stringify({completed:checks.length,total:ids.length,allCompleted:report.allCompleted,protectedInputsUnchanged:true}));
}
