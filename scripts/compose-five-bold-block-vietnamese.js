// Compose opaque Block panels by partitioning existing UVs, never repaint Flat.
// Default: review only. --apply --update-generated backs up changed composites.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {render,uv,pixel} from './five-offline-render.js';
import {vietnameseCreeperCharacters} from './vietnamese-character-map.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const font=path.join(root,'fonts/minecraft-five-bold-block-vietnamese'),bold=path.join(root,'fonts/minecraft-five-bold-vietnamese');
const apply=process.argv.includes('--apply'),update=process.argv.includes('--update-generated');assert.ok(process.argv.slice(2).every(a=>['--apply','--update-generated'].includes(a)));
const read=(base,n)=>JSON.parse(fs.readFileSync(path.join(base,'characters',n+'.json'))),hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const inputs=new Map();for(const base of [font,bold])for(const sub of ['characters','textures','overlays'])if(fs.existsSync(path.join(base,sub)))for(const n of fs.readdirSync(path.join(base,sub))){const f=path.join(base,sub,n);if(fs.statSync(f).isFile())inputs.set(f,hash(f));}
const atlas=await sharp(path.join(font,'textures/flat.png')).ensureAlpha().raw().toBuffer(),boldAtlas=await sharp(path.join(bold,'textures/flat.png')).ensureAlpha().raw().toBuffer();
assert.equal(atlas.length,1000*320*4);
const positive=e=>e.to.every((v,i)=>v>e.from[i]);
function projection(es,image=atlas,side='north'){const out=new Set();for(const e of es)if(positive(e)&&e.faces[side])for(let y=e.from[1];y<e.to[1];y++)for(let x=e.from[0];x<e.to[0];x++){const c=pixel(...uv(e,side,[x+.5,y+.5,8]),image);if(c[3]>128&&c[0]===255&&c[1]===255&&c[2]===255)out.add(x+','+y);}return out;}
const box=cells=>{const ps=[...cells].map(k=>k.split(',').map(Number));return[Math.min(...ps.map(p=>p[0])),Math.min(...ps.map(p=>p[1])),Math.max(...ps.map(p=>p[0]))+1,Math.max(...ps.map(p=>p[1]))+1];};
const moved=(es,dx,dy)=>structuredClone(es).map(e=>{for(const k of ['from','to']){e[k][0]+=dx;e[k][1]+=dy;}return e;});
const px=(a,b,c,d)=>[a/62.5,b/20,c/62.5,d/20];
const tones={'\u0300':'grave','\u0301':'acute','\u0309':'hookabove','\u0303':'~','\u0323':'.'};
function sourceParts(stem,char){
 const nfd=char.toLowerCase().normalize('NFD'),base=stem.startsWith('creeper_')?'creeper':nfd.includes('\u031b')?(nfd[0]==='o'?'ơ':'ư'):nfd[0],names=[base,nfd.includes('\u0302')?'^':nfd.includes('\u0306')?'breve':null,Object.entries(tones).find(([code])=>nfd.includes(code))?.[1]].filter(Boolean),model=read(bold,stem),visible=model.elements.filter(e=>positive(e)&&e.faces.north&&projection([e],boldAtlas).size),parts=[];
 for(const name of names){
  const template=read(bold,name).elements.filter(e=>positive(e)&&e.faces.north&&projection([e],boldAtlas).size);
  const fullUV=template.map(e=>e.faces.north.uv),candidate=visible.find(e=>fullUV.some(u=>e.faces.north.uv[0]>=u[0]-1e-7&&e.faces.north.uv[2]<=u[2]+1e-7&&e.faces.north.uv[1]>=u[1]-1e-7&&e.faces.north.uv[3]<=u[3]+1e-7));
  assert.ok(candidate,stem+' missing source '+name);
  const donor=template.find(e=>{const u=e.faces.north.uv,v=candidate.faces.north.uv;return v[0]>=u[0]-1e-7&&v[2]<=u[2]+1e-7&&v[1]>=u[1]-1e-7&&v[3]<=u[3]+1e-7;});
  const dx=candidate.faces.north.uv[0]*62.5+candidate.to[0]-donor.faces.north.uv[0]*62.5-donor.to[0],dy=candidate.faces.north.uv[1]*20+candidate.to[1]-donor.faces.north.uv[1]*20-donor.to[1];
  const target=read(font,name).elements;assert.equal(target.length,1,'Block template should be one cube');
  const wanted=box(projection(moved(template,Math.round(dx),Math.round(dy)),boldAtlas)),own=box(projection(target));
  const shiftX=(wanted[0]+wanted[2]-own[0]-own[2])/2,shiftY=(wanted[1]+wanted[3]-own[1]-own[3])/2+8;
  assert.ok(Number.isInteger(shiftX)&&Number.isInteger(shiftY));parts.push({name,e:moved(target,shiftX,shiftY)[0]});
 }
 const expected=new Set([...projection(model.elements,boldAtlas)].map(k=>{const[x,y]=k.split(',').map(Number);return x+','+(y+8);}));assert.deepEqual(projection(parts.map(p=>p.e)),expected,stem+' source silhouette');
 return{parts,expected};
}
// Exact minimum among guillotine partitions on all mask transition boundaries.
// A rectangle samples an authored component or a background area of its base.
// Background rectangles are partitioned into real, unscaled source texels below.
function partition(parts,ink,panel){
 const[a,b,c,d]=panel,W=c-a,H=d-b,sources=[...parts.map(p=>p.e),null],masks=[];
 for(let y=b;y<d;y++)for(let x=a;x<c;x++){
  let mask=0;const white=ink.has(x+','+y);
  sources.forEach((e,i)=>{if(!e){if(!white)mask|=1<<i;return;}if(x<e.from[0]||x>=e.to[0]||y<e.from[1]||y>=e.to[1])return;const p=pixel(...uv(e,'north',[x+.5,y+.5,8]),atlas);if(p[3]===255&&p[0]===(white?255:137))mask|=1<<i;});
  assert.ok(mask,'No source texel '+x+','+y);masks.push(mask);
 }
 const xs=new Set([0,W]),ys=new Set([0,H]);for(let y=0;y<H;y++)for(let x=0;x<W;x++){if(x&&masks[y*W+x]!==masks[y*W+x-1])xs.add(x);if(y&&masks[y*W+x]!==masks[(y-1)*W+x])ys.add(y);}
 const X=[...xs].sort((a,b)=>a-b),Y=[...ys].sort((a,b)=>a-b),nw=X.length-1,nh=Y.length-1,stride=nw+1;
 const sums=sources.map((_,s)=>{const sum=new Int32Array((nw+1)*(nh+1));for(let y=0;y<nh;y++)for(let x=0;x<nw;x++){const bad=Number(!(masks[Y[y]*W+X[x]]&(1<<s)));sum[(y+1)*stride+x+1]=bad+sum[y*stride+x+1]+sum[(y+1)*stride+x]-sum[y*stride+x];}return sum;});
 const memo=new Map();
 function solve(x0,y0,x1,y1){const key=[x0,y0,x1,y1].join(',');if(memo.has(key))return memo.get(key);
  for(let s=0;s<sources.length;s++){const p=sums[s],bad=p[y1*stride+x1]-p[y0*stride+x1]-p[y1*stride+x0]+p[y0*stride+x0];if(!bad){const result={count:1,source:s,rect:[a+X[x0],b+Y[y0],a+X[x1],b+Y[y1]]};memo.set(key,result);return result;}}
  let best={count:Infinity};for(let x=x0+1;x<x1;x++){const left=solve(x0,y0,x,y1),right=solve(x,y0,x1,y1);if(left.count+right.count<best.count)best={count:left.count+right.count,children:[left,right]};}
  for(let y=y0+1;y<y1;y++){const top=solve(x0,y0,x1,y),bottom=solve(x0,y,x1,y1);if(top.count+bottom.count<best.count)best={count:top.count+bottom.count,children:[top,bottom]};}
  assert.ok(Number.isFinite(best.count));memo.set(key,best);return best;
 }
 const solved=solve(0,0,nw,nh),leaves=[];function collect(n){if(n.children)n.children.forEach(collect);else leaves.push(n);}collect(solved);
 return{leaves,sources,states:memo.size};
}
const modulo=(n,d)=>(n%d+d)%d;
// Background comes only from blank front regions of the base character itself.
// Large rectangles are tiled with real texels, never stretched from one pixel.
const blankCache=new Map();
function backgroundTiles(rect,base){
 const [a,b,c,d]=rect,w=base.to[0]-base.from[0],h=base.to[1]-base.from[1],key=JSON.stringify(base.faces.north.uv);
 let cached=blankCache.get(key);
 if(!cached){
  const gray=Array.from({length:h},(_,y)=>Array.from({length:w},(_,x)=>{const p=pixel(...uv(base,'north',[base.from[0]+x+.5,base.from[1]+y+.5,8]),atlas);return p[3]===255&&p[0]===137;})),rects=[];
  for(let y0=0;y0<h;y0++){let good=Array(w).fill(true);for(let y1=y0;y1<h;y1++){good=good.map((v,x)=>v&&gray[y1][x]);for(let x=0;x<w;){if(!good[x]){x++;continue;}const left=x;while(x<w&&good[x])x++;if((y0===0||!gray[y0-1].slice(left,x).every(Boolean))&&(y1===h-1||!gray[y1+1].slice(left,x).every(Boolean)))rects.push([left,y0,x,y1+1]);}}}
  cached={rects,memo:new Map()};blankCache.set(key,cached);
 }
 function solve(W,H){const k=W+','+H;if(cached.memo.has(k))return cached.memo.get(k);
  const fit=cached.rects.find(r=>r[2]-r[0]>=W&&r[3]-r[1]>=H);if(fit){const out={count:1,width:W,height:H,sample:fit};cached.memo.set(k,out);return out;}
  let best={count:Infinity};for(let x=1;x<W;x++){const one=solve(x,H),two=solve(W-x,H);if(one.count+two.count<best.count)best={count:one.count+two.count,axis:'x',cut:x,children:[one,two]};}
  for(let y=1;y<H;y++){const one=solve(W,y),two=solve(W,H-y);if(one.count+two.count<best.count)best={count:one.count+two.count,axis:'y',cut:y,children:[one,two]};}
  assert.ok(Number.isFinite(best.count));cached.memo.set(k,best);return best;
 }
 const out=[];function collect(n,x,y){if(n.children){collect(n.children[0],x,y);collect(n.children[1],x+(n.axis==='x'?n.cut:0),y+(n.axis==='y'?n.cut:0));return;}const sx=base.from[0]+n.sample[0],sy=base.from[1]+n.sample[1];out.push({rect:[x,y,x+n.width,y+n.height],sample:[sx,sy,sx+n.width,sy+n.height],e:base,padding:true});}
 collect(solve(c-a,d-b),a,b);return out;
}
function faceUV(e,side,r){const[a,b,c,d]=r;return side==='north'?[...uv(e,side,[c,d,8]),...uv(e,side,[a,b,8])]:[...uv(e,side,[a,d,8]),...uv(e,side,[c,b,8])];}
function capUV(base,side,a,c){
 const w=base.to[0]-base.from[0],x=base.from[0]+modulo(a-base.from[0],w),y=side==='up'?base.to[1]:base.from[1];
 assert.ok(x+c-a<=base.to[0]+1e-7,'Cap crosses base UV edge');
 return[...uv(base,side,[x,y,side==='up'?0:16]),...uv(base,side,[x+c-a,y,side==='up'?16:0])];
}
const requests=[];for(const n of fs.readdirSync(path.join(bold,'characters'))){const ch=n.slice(0,-5);if(n.endsWith('.json')&&[...ch].length===1&&ch.normalize('NFD').length>1&&'aeiouy'.includes(ch.normalize('NFD')[0])&&!['ơ','ư'].includes(ch))requests.push([ch,ch]);}
assert.equal(requests.length,64);requests.push(...Object.entries(vietnameseCreeperCharacters));
const plans=[];
for(const[stem,char]of requests){
 const {parts,expected}=sourceParts(stem,char),panel=[Math.min(...parts.map(p=>p.e.from[0])),Math.min(...parts.map(p=>p.e.from[1])),Math.max(...parts.map(p=>p.e.to[0])),Math.max(...parts.map(p=>p.e.to[1]))],solution=partition(parts,expected,panel),center=8-(panel[0]+panel[2])/2;
 const base=parts[0].e,baseWidth=base.to[0]-base.from[0],pieces=solution.leaves.flatMap(({source,rect})=>solution.sources[source]?[{rect,sample:rect,e:solution.sources[source],sourceName:parts[source].name,padding:false}]:backgroundTiles(rect,base).map(p=>({...p,sourceName:parts[0].name})));
 // Split at base-cap UV boundaries so every cap keeps one texel per unit.
 const fragments=[];
 for(const p of pieces){const[a,b,c,d]=p.rect;let x=a;while(x<c){const next=Math.min(c,x+baseWidth-modulo(x-base.from[0],baseWidth)),sa=p.sample[0]+x-a;fragments.push({...p,rect:[x,b,next,d],sample:[sa,p.sample[1],sa+next-x,p.sample[3]]});x=next;}}
 const elements=fragments.map(({rect:[a,b,c,d],sample,e,sourceName,padding},index)=>{
  const face=u=>({uv:u,texture:'#0'}),faces={north:face(faceUV(e,'north',sample)),south:face(faceUV(e,'south',sample))};
  if(d===panel[3])faces.up=face(capUV(base,'up',a,c));if(b===panel[1])faces.down=face(capUV(base,'down',a,c));
  return{name:`${sourceName}_${padding?'background':'source'}_${index+1}`,from:[a+center,b,0],to:[c+center,d,16],faces};
 });
 const finalInk=new Set([...expected].map(k=>{const[x,y]=k.split(',').map(Number);return(x+center)+','+y;}));assert.deepEqual(projection(elements),finalInk,stem+' final front');assert.deepEqual(projection(elements,atlas,'south'),finalInk,stem+' final back');
 // Every front pixel belongs to exactly one opaque face: no holes or z-fighting.
 for(let y=panel[1];y<panel[3];y++)for(let x=panel[0]+center;x<panel[2]+center;x++){const covering=elements.filter(e=>x>=e.from[0]&&x<e.to[0]&&y>=e.from[1]&&y<e.to[1]);assert.equal(covering.length,1,stem+' overlapping panel rectangles');assert.equal(pixel(...uv(covering[0],'north',[x+.5,y+.5,8]),atlas)[3],255);}
 for(const e of elements){
  assert.equal(Boolean(e.faces.up),e.to[1]===panel[3],stem+' internal top cap');assert.equal(Boolean(e.faces.down),e.from[1]===panel[1],stem+' internal bottom cap');
  for(const side of ['up','down'])if(e.faces[side])for(let x=e.from[0]+.5;x<e.to[0];x++)for(let z=.5;z<16;z++)assert.deepEqual([...pixel(...uv(e,side,[x,side==='up'?e.to[1]:e.from[1],z]),atlas)],side==='up'?[176,176,176,255]:[84,84,84,255],stem+' cap texture');
  for(const [side,f]of Object.entries(e.faces)){
   assert.ok(Math.abs(Math.abs(f.uv[2]-f.uv[0])*62.5-(e.to[0]-e.from[0]))<1e-6,stem+' stretched UV width '+side);
   assert.ok(Math.abs(Math.abs(f.uv[3]-f.uv[1])*20-(side==='up'||side==='down'?16:e.to[1]-e.from[1]))<1e-6,stem+' stretched UV height '+side);
   const sourceRect=side==='up'||side==='down'?base.faces[side].uv:parts.find(p=>e.name.startsWith(p.name+'_')).e.faces[side].uv;
   for(const axis of [0,1]){const lo=Math.min(sourceRect[axis],sourceRect[axis+2]),hi=Math.max(sourceRect[axis],sourceRect[axis+2]);assert.ok(f.uv[axis]>=lo-1e-7&&f.uv[axis]<=hi+1e-7&&f.uv[axis+2]>=lo-1e-7&&f.uv[axis+2]<=hi+1e-7,stem+' UV escaped its own '+side+' source');}
  }
 }
 const model={credit:'By Ewan Howell & bl205vn',texture_size:[1000,320],textures:{'0':'minecraft-five-bold-block-vietnamese:flat'},elements},file=path.join(font,'characters',stem+'.json');
 if(fs.existsSync(file)&&!update)assert.deepEqual(JSON.parse(fs.readFileSync(file)),model,'Use --update-generated to back up and replace '+stem);
 plans.push({stem,char,model,file,cubes:elements.length,panel:[panel[0]+center,panel[1],panel[2]+center,panel[3]],sourceParts:parts.map(p=>({name:p.name,from:p.e.from,to:p.e.to})),partitionStates:solution.states});
}
for(const[f,h]of inputs)assert.equal(hash(f),h,'Input changed '+f);
const review=fs.mkdtempSync(path.join(root,'backups/block-compose-'));
fs.writeFileSync(path.join(review,'input-hashes.json'),JSON.stringify(Object.fromEntries(inputs),null,2));
const size=105,cols=9,rows=Math.ceil(plans.length/cols),layers=[];
for(const[i,p]of plans.entries())layers.push({input:await render(p.model,[0,0,1],size,atlas),left:i%cols*size,top:Math.floor(i/cols)*125+20});
const height=rows*125+20,labels=Buffer.from(`<svg width="945" height="${height}"><g fill="white" font-family="Arial" font-size="14">${plans.map((p,i)=>`<text x="${i%cols*size+5}" y="${Math.floor(i/cols)*125+16}">${p.char}</text>`).join('')}</g></svg>`);layers.push({input:labels,left:0,top:0});
await sharp({create:{width:945,height,channels:4,background:'#1c1e23'}}).composite(layers).png().toFile(path.join(review,'preview.png'));
const samples=['ả','ẳ','ự','ậ','Ả','Ẳ','Ặ'],angles=[];
for(const[i,ch]of samples.entries())for(const[j,d]of [[0,[0,0,1]],[1,[.5,-.7,1]],[2,[.5,.7,1]],[3,[0,0,-1]]])angles.push({input:await render(plans.find(p=>p.char===ch).model,d,150,atlas),left:j*150,top:i*150});
await sharp({create:{width:600,height:1050,channels:4,background:'#1c1e23'}}).composite(angles).png().toFile(path.join(review,'angles.png'));
if(apply)for(const p of plans){const text=JSON.stringify(p.model,null,'\t')+'\n';if(fs.existsSync(p.file)){if(fs.readFileSync(p.file,'utf8')===text)continue;assert.ok(update);fs.mkdirSync(path.join(review,'previous-models'),{recursive:true});fs.copyFileSync(p.file,path.join(review,'previous-models',p.stem+'.json'));}fs.writeFileSync(p.file,text);}
for(const[f,h]of inputs)if(!(apply&&plans.some(p=>p.file===f)))assert.equal(hash(f),h,'Protected source changed '+f);
if(apply)for(const p of plans)assert.deepEqual(JSON.parse(fs.readFileSync(p.file)),p.model,'Stored output mismatch');
const report={apply,ordinary:64,creeper:17,minCubes:Math.min(...plans.map(p=>p.cubes)),maxCubes:Math.max(...plans.map(p=>p.cubes)),atlasAndTemplatesUnchanged:true,ownBaseBackgroundAndCaps:true,allUVTexelsOneToOne:true,whiteLayoutMatchesApprovedBold:true,opaqueDisjointPanels:true,materialContinuityRequiresLaterTextureGeneration:true,guiVerified:false,review,models:plans.map(({stem,char,cubes,panel,sourceParts,partitionStates})=>({stem,char,cubes,panel,sourceParts,partitionStates}))};
fs.writeFileSync(path.join(review,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'backups/block-compose-last.txt'),review);console.log(JSON.stringify({...report,models:undefined},null,2));
