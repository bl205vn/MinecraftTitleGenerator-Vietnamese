// Shared Five JSON geometry and existing-atlas mask helpers.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import sharp from 'sharp';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),font=path.join(root,'fonts/minecraft-five-vietnamese');
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
 const cacheKey=[value,vertical,wanted.join('')].join(':');if(lineCache.has(cacheKey)){const found=lineCache.get(cacheKey);if(found)return found;throw Object.assign(Error('No existing strip: '+cacheKey),{vertical,mask:wanted});}
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
 lineCache.set(cacheKey,false);throw Object.assign(Error('No existing '+value+' strip for '+cacheKey),{vertical,mask:wanted});
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
 for(const [side,end]of [['up',1],['down',0]]){
  const donor=es.find(e=>e.faces[side]&&e[end?'to':'from'][1]===(end?y1:y0));assert.ok(donor);
  const cap=donor.faces[side].uv;faces[side]={uv:[north[2],cap[1],north[0],cap[3]],texture};
 }
 const e={from:[x0,y0,z0],to:[x1,y1,z1],faces};assert.deepEqual(white([e]),cells,'Merged white silhouette mismatch');return[e];
}

// A composed glyph may require a boundary pattern absent from the fixed atlas.
// Split only those rectangles, selecting the smallest guillotine partition
// whose face masks can all be sampled from existing texture strips.
function compatibleShells(rectangles,cells,texture){
 const memo=new Map();
 function solve(r){const k=r.join(',');if(memo.has(k))return memo.get(k);let failure;try{const out=[shell(r,cells,texture)];memo.set(k,out);return out;}catch(e){if(!e.mask)throw e;failure=e;}
  const[a,b,c,d]=r,lo=failure.vertical?b:a,hi=failure.vertical?d:c;
  const cuts=[];for(let i=1;i<failure.mask.length;i++)if(failure.mask[i]!==failure.mask[i-1])cuts.push(lo+i);
  cuts.sort((x,y)=>Math.abs((lo+hi)/2-x)-Math.abs((lo+hi)/2-y));let best=null;
  for(const cut of cuts){if(cut<=lo||cut>=hi)continue;const one=failure.vertical?[a,b,c,cut]:[a,b,cut,d],two=failure.vertical?[a,cut,c,d]:[cut,b,c,d];const out=[...solve(one),...solve(two)];if(!best||out.length<best.length)best=out;if(best.length===2)break;}
  assert.ok(best,'Cannot partition mask '+k);memo.set(k,best);return best;
 }
 return rectangles.flatMap(solve);
}

export {white,dilate,cover,shell,bounds,positive,color,px,key,sample,strip,mergeWhite,compatibleShells};
