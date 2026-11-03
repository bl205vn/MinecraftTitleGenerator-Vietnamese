// Prototype only: add authored Five Vietnamese silhouettes expanded by one pixel.
// Preserve every original Bold atlas cell and model. No font registry/build changes.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';import sharp from 'sharp';
import {white as fiveWhite,dilate,cover,bounds,positive} from './five-model-geometry.js';
import {render,uv,pixel} from './five-offline-render.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),source=path.join(root,'fonts/minecraft-five-vietnamese'),original=path.join(root,'fonts/minecraft-five-bold'),target=path.join(root,'fonts/minecraft-five-bold-vietnamese'),apply=process.argv.includes('--apply');
assert.ok(process.argv.slice(2).every(a=>a==='--apply'));
const hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex'),snapshots=new Map();
for(const base of [source,original,target])for(const sub of ['characters','textures','overlays'])if(fs.existsSync(path.join(base,sub)))for(const f of fs.readdirSync(path.join(base,sub))){const p=path.join(base,sub,f);if(fs.statSync(p).isFile())snapshots.set(p,hash(p));}
const input=fs.readFileSync(path.join(target,'textures/flat.png')),decoded=await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true}),data=Buffer.from(decoded.data);assert.deepEqual([decoded.info.width,decoded.info.height],[1000,320]);
const refAtlas=(await sharp(path.join(original,'textures/flat.png')).ensureAlpha().raw().toBuffer({resolveWithObject:true})).data;
const px=(a,b,c,d)=>[a/62.5,b/20,c/62.5,d/20];
const read=(base,name)=>JSON.parse(fs.readFileSync(path.join(base,'characters',name+'.json')));
const normalized=cells=>{const ps=[...cells].map(p=>p.split(',').map(Number)),x0=Math.min(...ps.map(p=>p[0])),x1=Math.max(...ps.map(p=>p[0]))+1,y0=Math.min(...ps.map(p=>p[1])),y1=Math.max(...ps.map(p=>p[1]))+1;return{w:x1-x0,h:y1-y0,cells:new Set(ps.map(([x,y])=>(x1-x-1)+','+(y1-y-1)))};};
function grow(pattern){const ps=new Set();for(const p of pattern.cells){const[x,y]=p.split(',').map(Number);for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++)ps.add((x+i+1)+','+(y+j+1));}return{w:pattern.w+2,h:pattern.h+2,cells:ps};}
function nativeMask(name){const e=read(original,name).elements.find(e=>positive(e)&&e.faces.north),u=e.faces.north.uv,[a,b,c,d]=[u[0]*62.5,u[1]*20,u[2]*62.5,u[3]*20].map(Math.round),ps=new Set();for(let y=b;y<d;y++)for(let x=a;x<c;x++){const i=(y*1000+x)*4;if(refAtlas[i]===255&&refAtlas[i+1]===255&&refAtlas[i+2]===255&&refAtlas[i+3])ps.add((x-a)+','+(y-b));}return{w:c-a,h:d-b,cells:ps};}
for(const n of ['a','e','o','u','^','~','.'])assert.deepEqual(grow(normalized(fiveWhite(read(source,n).elements))),nativeMask(n),'Bold dilation regression: '+n);
const changedRegions=[];function reserve(x,y,w,h,label){assert.ok(x>=0&&y>=0&&x+w<=1000&&y+h<=320);for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++)assert.equal(decoded.data[(j*1000+i)*4+3],0,'Reserved area occupied: '+label+' '+i+','+j);changedRegions.push({label,x,y,w,h});}
function set(x,y,c){data.set(c,(y*1000+x)*4);}
const plans=[],atlasCells=[],maskCache=new Map();let maskX=0,maskY=244,shelf=0;
const solid=(()=>{for(let y=212;y<244;y++)for(let x=0;x<1000;x++){const i=(y*1000+x)*4;if(data[i]===0&&data[i+1]===0&&data[i+2]===0&&data[i+3]===255)return px(x,y,x+1,y+1);}throw Error('No solid black reference');})();
function maskUV(mask,vertical){if(!mask.some(Boolean))return null;if(mask.every(Boolean))return [...solid];const key=vertical+':'+mask.join('');if(maskCache.has(key))return maskCache.get(key);const w=vertical?1:mask.length,h=vertical?mask.length:1;if(maskX+w>1000){maskX=0;maskY+=shelf+2;shelf=0;}assert.ok(maskY+h<=320,'Mask storage exhausted');reserve(maskX,maskY,w,h,'border mask');for(let j=0;j<mask.length;j++)set(maskX+(vertical?0:j),maskY+(vertical?j:0),mask[j]?[0,0,0,255]:[0,0,0,0]);const uv=px(maskX,maskY,maskX+w,maskY+h);maskX+=w+2;shelf=Math.max(shelf,h);maskCache.set(key,uv);return uv;}
function shell(rect,cells){const[a,b,c,d]=rect,faces={north:{uv:[...solid],texture:'#0'},south:{uv:[...solid],texture:'#0'}},masks={east:Array.from({length:d-b},(_,i)=>!cells.has((a-1)+','+(b+i))),west:Array.from({length:d-b},(_,i)=>!cells.has(c+','+(b+i))),up:Array.from({length:c-a},(_,i)=>!cells.has((c-1-i)+','+(b-1))),down:Array.from({length:c-a},(_,i)=>!cells.has((c-1-i)+','+d))};for(const[side,m]of Object.entries(masks)){const uv=maskUV(m.map(Number),side==='east'||side==='west');if(uv)faces[side]={uv,texture:'#0'};}return{from:[c,d,18],to:[a,b,-2],faces};}
const specs=[['grave',256,148],['acute',272,148],['hookabove',288,148],['breve',310,148],['đ',338,154],['ư',378,148],['ơ',418,154]];
let bodyCapX=460;
for(const [name,x,y]of specs){const p=grow(normalized(fiveWhite(read(source,name).elements))),bottom=name==='đ'||name==='ư'||name==='ơ'?2:20,x0=8-p.w/2,x1=8+p.w/2,y1=bottom+p.h;reserve(x,132,p.w,78,name+' front/caps');
 for(const key of p.cells){const[a,b]=key.split(',').map(Number);set(x+a,y+b,[255,255,255,255]);}
 for(let i=0;i<p.w;i++){if(p.cells.has(i+',0'))for(let j=132;j<148;j++)set(x+i,j,[176,176,176,255]);if(p.cells.has(i+','+(p.h-1)))for(let j=194;j<210;j++)set(x+i,j,[84,84,84,255]);}
 const face=(u)=>({uv:u,texture:'#0'}),north=px(x,y,x+p.w,y+p.h),south=px(x+p.w,y,x,y+p.h),up=px(x+p.w,148,x,132),down=px(x+p.w,210,x,194);let whites;
 if(name==='ư'){
  // Split front at the body's upper edge: no coplanar overlapping faces.
  // The body gets a full-depth gray cap only where the horn does not cover it.
  const split=6,capMask=Array.from({length:p.w},(_,i)=>p.cells.has(i+','+split)&&!p.cells.has(i+','+(split-1)));reserve(bodyCapX,132,p.w,16,'ư exposed body cap');for(let i=0;i<p.w;i++)if(capMask[i])for(let j=132;j<148;j++)set(bodyCapX+i,j,[176,176,176,255]);
  const topPixels=[...p.cells].map(p=>p.split(',').map(Number)).filter(p=>p[1]<split),lo=Math.min(...topPixels.map(p=>p[0])),hi=Math.max(...topPixels.map(p=>p[0]))+1;
  whites=[{from:[x0,bottom,0],to:[x1,y1-split,16],faces:{north:face(px(x,y+split,x+p.w,y+p.h)),south:face(px(x+p.w,y+split,x,y+p.h)),up:face(px(bodyCapX+p.w,148,bodyCapX,132)),down:face(down)}},{from:[x1-hi,y1-split,0],to:[x1-lo,y1,16],faces:{north:face(px(x+lo,y,x+hi,y+split)),south:face(px(x+hi,y,x+lo,y+split)),up:face(px(x+hi,148,x+lo,132))}}];
 }else whites=[{from:[x0,bottom,0],to:[x1,y1,16],faces:{north:face(north),south:face(south),up:face(up),down:face(down)}}];
 const world=new Set([...p.cells].map(k=>{const[a,b]=k.split(',').map(Number);return(x1-a-1)+','+(y1-b-1);})),outline=dilate(world),solution=cover(outline),elements=[...whites,...solution.rectangles.map(r=>shell(r,outline))],model={credit:'By Ewan Howell & bl205vn',texture_size:[1000,320],textures:{'0':'minecraft-five-bold-vietnamese:flat'},elements};
 const b=bounds(elements);assert.equal((b[0][0]+b[0][1])/2,8);assert.equal((b[2][0]+b[2][1])/2,8);
 plans.push({name,model,pattern:p,world,outline});atlasCells.push({name,front:[x,y,p.w,p.h],up:[x,132,p.w,16],down:[x,194,p.w,16],cubes:elements.length});
}
for(const[name,donor,box]of [['dotbelow','.',[616,106,8,8]],['tilde','~',[848,82,26,14]]]){const m=read(original,donor),uv=m.elements[0].faces.north.uv;assert.deepEqual(uv.map((v,i)=>Math.round(v*(i%2?20:62.5))),[box[0],box[1],box[0]+box[2],box[1]+box[3]]);m.credit='By Ewan Howell & bl205vn';m.textures=Object.fromEntries(Object.keys(m.textures).map(k=>[k,k==='particle'?'minecraft-five-bold-vietnamese:flat':'minecraft-five-bold-vietnamese:flat']));plans.push({name,model:m,reused:true});atlasCells.push({name,front:box,reusedFrom:donor,cubes:m.elements.length});}
// Independent actual face sampling verifies both silhouettes and all masked
// inward-facing walls at fractional coordinates.
let wallSamples=0;
for(const p of plans){assert.ok(!fs.existsSync(path.join(target,'characters',p.name+'.json')),'Refusing to overwrite '+p.name);const box=bounds(p.model.elements);assert.equal((box[0][0]+box[0][1])/2,8);assert.equal((box[2][0]+box[2][1])/2,8);if(p.reused)continue;
 for(const side of ['north','south']){const whites=new Set(),blacks=new Set();for(const e of p.model.elements)if(e.faces[side])for(let yy=Math.min(e.from[1],e.to[1]);yy<Math.max(e.from[1],e.to[1]);yy++)for(let xx=Math.min(e.from[0],e.to[0]);xx<Math.max(e.from[0],e.to[0]);xx++){const c=pixel(...uv(e,side,[xx+.5,yy+.5,0]),data);if(c[3]&&c[0]===255)whites.add(xx+','+yy);if(c[3]&&c[0]===0)blacks.add(xx+','+yy);}assert.deepEqual(whites,p.world,p.name+' white '+side);assert.equal([...p.outline].filter(k=>!whites.has(k)&&!blacks.has(k)).length,0,p.name+' missing border');assert.equal([...blacks].filter(k=>!p.outline.has(k)).length,0,p.name+' extra border');}
 for(const e of p.model.elements.filter(e=>!positive(e))){const[a,b]=e.to,[c,d]=e.from;for(const side of ['east','west','up','down']){const hor=side==='up'||side==='down',lo=hor?a:b,hi=hor?c:d;for(let s=lo+.0625;s<hi;s+=.125)for(const z of [-1.75,4.25,11.75,17.75]){let point,k;if(side==='east'){point=[a,s,z];k=(a-1)+','+Math.floor(s);}if(side==='west'){point=[c,s,z];k=c+','+Math.floor(s);}if(side==='up'){point=[s,b,z];k=Math.floor(s)+','+(b-1);}if(side==='down'){point=[s,d,z];k=Math.floor(s)+','+d;}const alpha=e.faces[side]?pixel(...uv(e,side,point),data)[3]:0;assert.equal(alpha>128,!p.outline.has(k),p.name+' inner wall '+side);wallSamples++;}}}
 for(const e of p.model.elements.filter(positive))for(const side of ['up','down'])if(e.faces[side]){
  const face=e.faces[side],plane=side==='up'?e.to[1]:e.from[1];assert.ok(Math.abs(Math.abs(face.uv[3]-face.uv[1])*20-16)<1e-7,p.name+' cap depth');
  for(let x=e.from[0]+.5;x<e.to[0];x++)for(let z=.5;z<16;z++){
   const below=p.world.has(Math.floor(x)+','+(plane-1)),above=p.world.has(Math.floor(x)+','+plane),visible=side==='up'?below&&!above:above&&!below,c=pixel(...uv(e,side,[x,plane,z]),data);
   assert.equal(c[3]>128,visible,p.name+' cap mask '+side);if(visible)assert.equal(c[0],side==='up'?176:84,p.name+' cap shading');
  }
 }
}
for(let y=0;y<320;y++)for(let x=0;x<1000;x++){const i=(y*1000+x)*4;if(!data.subarray(i,i+4).equals(decoded.data.subarray(i,i+4)))assert.ok(changedRegions.some(r=>x>=r.x&&x<r.x+r.w&&y>=r.y&&y<r.y+r.h),'Original atlas cell changed');}
for(const[f,h]of snapshots)assert.equal(hash(f),h,'Input changed: '+f);
const review=fs.mkdtempSync(path.join(root,'backups/five-bold-prototype-'));fs.writeFileSync(path.join(review,'input-hashes.json'),JSON.stringify(Object.fromEntries(snapshots),null,2));fs.writeFileSync(path.join(review,'flat-before.png'),input);const png=await sharp(data,{raw:decoded.info}).png().toBuffer();fs.writeFileSync(path.join(review,'flat-candidate.png'),png);
const layers=[],names=plans.map(p=>p.name);for(let row=0;row<plans.length;row++){const p=plans[row];for(const[col,dir]of [[0,[0,0,1]],[1,[.5,-.7,1]],[2,[.5,.7,1]],[3,[0,0,-1]]])layers.push({input:await render(p.model,dir,140,data),left:col*140,top:row*160+25});}
const labels=Buffer.from('<svg width="560" height="1465"><g fill="white" font-size="14" font-family="Arial"><text x="4" y="18">FRONT</text><text x="144" y="18">ABOVE</text><text x="284" y="18">BELOW</text><text x="424" y="18">BACK</text>'+names.map((n,i)=>'<text x="4" y="'+(i*160+40)+'">'+n+'</text>').join('')+'</g></svg>');layers.push({input:labels,left:0,top:0});await sharp({create:{width:560,height:1465,channels:4,background:'#1c1e23'}}).composite(layers).png().toFile(path.join(review,'models-preview.png'));
if(apply){fs.copyFileSync(path.join(review,'flat-candidate.png'),path.join(target,'textures/flat.png'));for(const p of plans)fs.writeFileSync(path.join(target,'characters',p.name+'.json'),JSON.stringify(p.model,null,'\t')+'\n',{flag:'wx'});}
for(const[f,h]of snapshots)if(!(apply&&f===path.join(target,'textures/flat.png')))assert.equal(hash(f),h,'Protected input changed: '+f);
const report={apply,atlasCells,caretReusedAt:[804,82,20,14],wallSamples,sourceAndOriginalTargetModelsUnchanged:true,newModelCount:plans.length,frontBorder2px:true,centerXZ8:true,fullDepthCaps16px:true,changedRegions,review,guiVerified:false};fs.writeFileSync(path.join(review,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'backups/five-bold-prototype-last.txt'),review);console.log(JSON.stringify({...report,changedRegions:undefined},null,2));
