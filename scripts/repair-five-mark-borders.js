// JSON-only repair. Existing PNGs are inputs; never paint a new atlas mask.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const font=path.join(root,'fonts/minecraft-five-vietnamese');
const apply=process.argv.includes('--apply');
const names=['ư','hookabove','grave','breve','acute'];
const digest=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const files=fs.readdirSync(path.join(font,'characters')).map(f=>path.join(font,'characters',f));
const protectedFiles=[...files.filter(f=>!names.some(n=>f.endsWith('/'+n+'.json')||f.endsWith('\\'+n+'.json'))),...['textures','overlays'].flatMap(d=>fs.existsSync(path.join(font,d))?fs.readdirSync(path.join(font,d)).map(f=>path.join(font,d,f)).filter(f=>fs.statSync(f).isFile()):[])];
const hashes=Object.fromEntries(protectedFiles.map(f=>[f,digest(f)]));
const {data}=await sharp(path.join(font,'textures/flat.png')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
function color(x,y){if(x<0||x>=1000||y<0||y>=320)return -1;const i=(Math.floor(y)*1000+Math.floor(x))*4;return data[i+3]>128?data[i]:-1;}
const px=(a,b,c,d)=>[a/62.5,b/20,c/62.5,d/20];
const positive=e=>e.to.every((v,i)=>v>e.from[i]);
const key=(x,y)=>x+','+y;
function bounds(es){return [0,1,2].map(a=>[Math.min(...es.flatMap(e=>[e.from[a],e.to[a]])),Math.max(...es.flatMap(e=>[e.from[a],e.to[a]]))]);}
function sample(e,side,x,y){const a=e.faces[side]?.uv;if(!a)return -1;const u=side==='north'?(e.to[0]-x)/(e.to[0]-e.from[0]):(x-e.from[0])/(e.to[0]-e.from[0]);const v=(e.to[1]-y)/(e.to[1]-e.from[1]);return color((a[0]+(a[2]-a[0])*u)*62.5,(a[1]+(a[3]-a[1])*v)*20);}
function white(es,side='north'){
 const cells=new Set();for(const e of es.filter(positive))if(e.faces[side])for(let y=e.from[1];y<e.to[1];y++)for(let x=e.from[0];x<e.to[0];x++)if(sample(e,side,x+.5,y+.5)===255)cells.add(key(x,y));return cells;
}
function dilate(cells){const out=new Set();for(const p of cells){const[x,y]=p.split(',').map(Number);for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)out.add(key(x+dx,y+dy));}return out;}
// Enumerate maximal rectangles in a compressed occupancy grid, then solve the
// exact minimum-cardinality cover. Overlap is allowed; hidden side faces are
// masked against the complete union, not against a single neighboring cube.
function cover(cells){
 const points=[...cells].map(p=>p.split(',').map(Number));const xs=[...new Set(points.flatMap(([x])=>[x,x+1]))].sort((a,b)=>a-b),ys=[...new Set(points.flatMap(([,y])=>[y,y+1]))].sort((a,b)=>a-b);
 const x0=xs[0],x1=xs.at(-1),y0=ys[0],y1=ys.at(-1),W=x1-x0,H=y1-y0;
 const rows=Array.from({length:H},(_,y)=>Array.from({length:W},(_,x)=>cells.has(key(x+x0,y+y0))));
 const candidates=[];
 for(let a=0;a<H;a++){
  let good=new Array(W).fill(true);
  for(let b=a;b<H;b++){
   good=good.map((v,x)=>v&&rows[b][x]);let x=0;
   while(x<W){if(!good[x]){x++;continue;}const l=x;while(x<W&&good[x])x++;const r=x;
    if((a===0||!rows[a-1].slice(l,r).every(Boolean))&&(b===H-1||!rows[b+1].slice(l,r).every(Boolean)))candidates.push([l+x0,a+y0,r+x0,b+1+y0]);
   }
  }
 }
 const index=new Map([...cells].map((p,i)=>[p,i]));
 const rects=candidates.map(box=>{let bits=0n;const[a,b,c,d]=box;for(let y=b;y<d;y++)for(let x=a;x<c;x++)bits|=1n<<BigInt(index.get(key(x,y)));return{box,bits};});
 const all=(1n<<BigInt(cells.size))-1n,byCell=Array.from({length:cells.size},()=>[]);
 for(let r=0;r<rects.length;r++)for(let i=0;i<cells.size;i++)if(rects[r].bits&(1n<<BigInt(i)))byCell[i].push(r);
 let best=rects.map((_,i)=>i),nodes=0;const visited=new Map();
 function dfs(done,chosen){nodes++;if(done===all){if(chosen.length<best.length)best=[...chosen];return;}if(chosen.length>=best.length)return;if((visited.get(done)??Infinity)<=chosen.length)return;visited.set(done,chosen.length);
  let options=null;for(let i=0;i<cells.size;i++)if(!(done&(1n<<BigInt(i)))){if(options===null||byCell[i].length<options.length)options=byCell[i];if(options.length===1)break;}
  for(const r of options)dfs(done|rects[r].bits,[...chosen,r]);
 }
 dfs(0n,[]);return{rectangles:best.map(i=>rects[i].box),candidateRectangles:rects.length,searchNodes:nodes,minimumRectangularCover:true};
}
const lineCache=new Map();
// Reuse 1D black/clear or gray/clear strips, stretching a pixel only when all
// unit-cell samples still match exactly. This also masks internal shell caps.
function strip(wanted,value,vertical=false){
 if(!wanted.some(Boolean))return null;
 const cacheKey=[value,vertical,wanted.join('')].join(':');if(lineCache.has(cacheKey))return lineCache.get(cacheKey);
 const L=wanted.length;
 if(wanted.every(Boolean)){
  for(let y=0;y<320;y++)for(let x=0;x<1000;x++)if(color(x,y)===value){const uv=px(x,y,x+1,y+1);lineCache.set(cacheKey,uv);return uv;}
 }
 // Mark masks are authored in the lower atlas; cap strips may be anywhere.
 const ranges=value===0?[[0,206,260,236]]:[[0,0,1000,80],[0,110,1000,126]];
 for(const [ax,ay,bx,by]of ranges)for(const transpose of [false,true])for(let span=1;span<=Math.min(64,L*2);span++)for(let y=ay;y<by;y++)for(let x=ax;x<bx;x++){
  if((transpose?y+span>320:x+span>1000))continue;
  if(transpose!==vertical)continue;
  for(const flip of [false,true]){
   let ok=true;
   for(let probe=0;probe<L*8;probe++){
    const j=(probe+.5)/8;
    const q=Math.min(span-1,Math.floor(j*span/L)),offset=flip?span-1-q:q;
    const c=color(x+(transpose?0:offset),y+(transpose?offset:0));if(c!==(wanted[Math.floor(j)]?value:-1)){ok=false;break;}
   }
   if(ok){
    // Transpose is valid only when the texture's variation follows the UV
    // axis that the model varies along the face.
    if(transpose!==vertical)continue;
    const uv=vertical?px(x,y+(flip?span:0),x+1,y+(flip?0:span)):px(x+(flip?span:0),y,x+(flip?0:span),y+1);
    lineCache.set(cacheKey,uv);return uv;
   }
  }
 }
 throw Error('No existing '+value+' strip for '+cacheKey);
}
function shell(rect,cells,texture){
 const[a,b,c,d]=rect,faces={north:{uv:strip([1],0),texture},south:{uv:strip([1],0),texture}};
 const masks={east:Array.from({length:d-b},(_,i)=>!cells.has(key(a-1,b+i))),west:Array.from({length:d-b},(_,i)=>!cells.has(key(c,b+i))),up:Array.from({length:c-a},(_,i)=>!cells.has(key(c-1-i,b-1))),down:Array.from({length:c-a},(_,i)=>!cells.has(key(c-1-i,d)))};
 for(const[side,m]of Object.entries(masks)){const uv=strip(m.map(Number),0,side==='east'||side==='west');if(uv)faces[side]={uv,texture};}
 return{from:[c,d,18],to:[a,b,-2],faces};
}
function mergeWhite(es,cells){
 if(es.length===1||es.length===2)return es;
 const b=bounds(es),[[x0,x1],[y0,y1],[z0,z1]]=b,texture=es[0].faces.north.texture;
 const anchors=es.map(e=>[e.faces.north.uv[0]*62.5+e.to[0],e.faces.north.uv[1]*20+e.to[1]]);
 assert.ok(anchors.every(a=>Math.abs(a[0]-anchors[0][0])<1e-6&&Math.abs(a[1]-anchors[0][1])<1e-6),'Non-contiguous front UVs');
 const [u,v]=anchors[0],north=px(u-x1,v-y1,u-x0,v-y0),south=[north[2],north[1],north[0],north[3]];
 const faces={north:{uv:north,texture},south:{uv:south,texture}};
 for(const[side,y,value]of [['up',y1-1,176],['down',y0,84]]){
  const mask=Array.from({length:x1-x0},(_,i)=>Number(cells.has(key(x0+i,y))));const uv=strip(mask,value);if(uv)faces[side]={uv,texture};
 }
 const e={from:[x0,y0,z0],to:[x1,y1,z1],faces};assert.deepEqual(white([e]),cells,'Merged white silhouette mismatch');return[e];
}
const reports=[],outputs=[];
for(const name of names){
 const file=path.join(font,'characters',name+'.json'),raw=fs.readFileSync(file),before=JSON.parse(raw),model=structuredClone(before),cells=white(before.elements),expanded=dilate(cells);
 const whiteElements=mergeWhite(before.elements.filter(e=>positive(e)&&e.faces.north&&white([e]).size).map(e=>structuredClone(e)),cells),solution=cover(expanded),texture=whiteElements[0].faces.north.texture;
 model.elements=[...whiteElements,...solution.rectangles.map(r=>shell(r,expanded,texture))];
 const b=bounds(model.elements),dx=8-(b[0][0]+b[0][1])/2,dz=8-(b[2][0]+b[2][1])/2;
 for(const e of model.elements){for(const k of ['from','to']){e[k][0]+=dx;e[k][2]+=dz;}if(e.rotation){e.rotation.origin[0]+=dx;e.rotation.origin[2]+=dz;}}
 const shifted=new Set([...cells].map(p=>{const[x,y]=p.split(',').map(Number);return key(x+dx,y);}));assert.deepEqual(white(model.elements),shifted);assert.deepEqual(white(model.elements,'south'),shifted,'Back/front mismatch: '+name);
 assert.ok(model.elements.length<=before.elements.length,'Cube count increased: '+name);
 reports.push({name,before:before.elements.length,after:model.elements.length,whiteCubes:whiteElements.length,borderCubes:solution.rectangles.length,centerShift:[dx,0,dz],...solution});
 outputs.push({file,raw,text:JSON.stringify(model,null,'\t')+'\n'});
}
// Read-only audit of the two additional letters.
const audits=[];
for(const name of ['đ','ơ']){
 const model=JSON.parse(fs.readFileSync(path.join(font,'characters',name+'.json'))),front=white(model.elements),back=white(model.elements,'south'),expected=dilate(front),b=bounds(model.elements);
 const checks={};for(const side of ['north','south']){const black=new Set();for(const e of model.elements)if(e.faces[side])for(let y=Math.min(e.from[1],e.to[1]);y<Math.max(e.from[1],e.to[1]);y++)for(let x=Math.min(e.from[0],e.to[0]);x<Math.max(e.from[0],e.to[0]);x++)if(sample(e,side,x+.5,y+.5)===0)black.add(key(x,y));checks[side]={missingBorder:[...expected].filter(p=>!front.has(p)&&!black.has(p)).length,extraBorder:[...black].filter(p=>!expected.has(p)).length};}
 audits.push({name,cubes:model.elements.length,center:[(b[0][0]+b[0][1])/2,(b[2][0]+b[2][1])/2],frontBackWhiteMatch:front.size===back.size&&[...front].every(p=>back.has(p)),...checks});
}
let backup=null;if(apply){backup=fs.mkdtempSync(path.join(root,'backups/five-mark-border-'));for(const o of outputs){assert.ok(fs.readFileSync(o.file).equals(o.raw));fs.writeFileSync(path.join(backup,path.basename(o.file)),o.raw);fs.writeFileSync(o.file,o.text);}fs.writeFileSync(path.join(backup,'protected-hashes.json'),JSON.stringify(hashes,null,2));fs.writeFileSync(path.join(root,'backups/five-mark-border-last.txt'),backup);}
for(const[f,h]of Object.entries(hashes))assert.equal(digest(f),h,'Unrelated file changed: '+f);
const report={apply,reports,audits,texturesAndUnrelatedModelsUnchanged:true,guiVerified:false,backup};if(backup)fs.writeFileSync(path.join(backup,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
