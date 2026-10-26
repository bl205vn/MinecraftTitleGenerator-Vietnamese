import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {loadContext} from './ten-overlay-context.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),ctx=await loadContext(root);
const relative='fonts/minecraft-ten-vietnamese/overlays/cartoon.png';
const {data,info}=await sharp(path.join(root,relative)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const old=await sharp(execFileSync('git',['show','HEAD:'+relative],{cwd:root})).ensureAlpha().raw().toBuffer();
assert.deepEqual([info.width,info.height],[4000,1280]);
const generation=JSON.parse(fs.readFileSync(path.join(root,'backups/ten-overlay-review/results/cartoon.json')));
assert.equal(generation.authoredReferences.length,10);
const areas=generation.authoredReferences.map(r=>r.box),W=4000;
let changes=0,strays=0;
for(let y=0;y<1280;y++)for(let x=0;x<W;x++){
  const i=(y*W+x)*4,xx=x/4,yy=y/4;
  if(data[i+3]&&!(ctx.target.c[Math.floor(yy)*1000+Math.floor(xx)]>=1&&ctx.target.c[Math.floor(yy)*1000+Math.floor(xx)]<=3))strays++;
  if(data.subarray(i,i+4).equals(old.subarray(i,i+4)))continue;
  changes++;assert.ok(areas.some(([a,b,c,d])=>xx>=a&&xx<c&&yy>=b&&yy<d),`Unexpected change at ${x},${y}`);
}
assert.equal(strays,0);
for(const[name,base]of [['ư','u'],['ơ','o']]){
  const b=generation.authoredReferences.find(r=>r.name===name+' body').box;
  const s=ctx.source.regions.find(r=>r.name===base).box;
  for(let y=0;y<160;y++)for(let x=0;x<112;x++){
    const i=((b[1]*4+y)*W+b[0]*4+x)*4,j=((s[1]*4+y)*W+s[0]*4+x)*4;
    assert.ok(data.subarray(i,i+4).equals(data.subarray(j,j+4)),name+' body differs from first-row '+base);
  }
}
// D's unwanted interior/right highlight is absent, while its top stays lit.
let top=0,wrongRight=0;
for(let y=0;y<160;y++)for(let x=0;x<144;x++){
  const a=data[(((22*4+y)*W)+902*4+x)*4+3];
  if(y<16)top+=a>0;
  if(x>=96&&y>=32)wrongRight+=a>0;
}
assert.ok(top);assert.equal(wrongRight,0);
// Independently recompute a soft top-only lip on both the direct and mirrored
// acute mask. A lateral directional glow would fail this reflection check.
const x0=217,y0=208,w=64,h=48;
function expected(x,y,flip){
  const white=(xx,yy)=>xx>=0&&xx<w&&yy>=0&&yy<h&&ctx.target.white[(y0+Math.floor(yy/4))*1000+x0+Math.floor((flip?w-1-xx:xx)/4)];
  if(!white(x,y))return 0;
  let depth=0;for(let n=1;n<=4;n++){if(!white(x,y-n))break;depth++;}
  return depth<4?Math.round(255*(4-depth)/4):0;
}
for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const a=data[((y0*4+y)*W+x0*4+x)*4+3];
  assert.equal(a,expected(x,y,false));
  assert.equal(a,expected(w-1-x,y,true),'Mirrored grave would reverse the lip direction');
}
for(const f of fs.readdirSync(path.join(ctx.target.base,'overlays')).filter(f=>f.endsWith('.png')&&f!=='cartoon.png')){
  const rel='fonts/minecraft-ten-vietnamese/overlays/'+f;
  assert.ok(fs.readFileSync(path.join(root,rel)).equals(execFileSync('git',['show','HEAD:'+rel],{cwd:root})),'Other overlay modified: '+f);
}
for(const rel of ['fonts/minecraft-ten-vietnamese/textures/flat.png'])
  assert.ok(fs.readFileSync(path.join(root,rel)).equals(execFileSync('git',['show','HEAD:'+rel],{cwd:root})),'Flat modified');
const report={changedPixels:changes,changedOutsideRequestedRegions:0,strayPixels:0,uAndOBodyPixelMatches:true,
  dTopPreserved:true,dInteriorRightHighlightRemoved:true,acuteGraveMirrorInvariant:true,other20OverlaysUnchanged:true,flatUnchanged:true,blockbenchVerified:false};
fs.writeFileSync(path.join(root,'backups/ten-overlay-review/cartoon-retouch-verification.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
