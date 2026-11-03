// Transfer approved Five placements to Bold templates without painting the atlas.
// Default: build a review bundle. --apply --update-generated: back up and update
// the composed models to match the user's Bold stroke reference.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {cover,dilate,bounds,positive,white as thinWhite} from './five-model-geometry.js';
import {render,uv,pixel} from './five-offline-render.js';
import {vietnameseCreeperCharacters} from './vietnamese-character-map.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const thin=path.join(root,'fonts/minecraft-five-vietnamese');
const font=path.join(root,'fonts/minecraft-five-bold-vietnamese');
const dir=path.join(font,'characters'),apply=process.argv.includes('--apply');
const update=process.argv.includes('--update-generated');
assert.ok(process.argv.slice(2).every(a=>['--apply','--update-generated'].includes(a)));
const read=(base,n)=>JSON.parse(fs.readFileSync(path.join(base,'characters',n+'.json')));
const atlas=(await sharp(path.join(font,'textures/flat.png')).ensureAlpha().raw().toBuffer({resolveWithObject:true})).data;
const hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const inputs=new Map();
for(const base of [thin,font])for(const sub of ['characters','textures','overlays'])if(fs.existsSync(path.join(base,sub)))for(const n of fs.readdirSync(path.join(base,sub))){const f=path.join(base,sub,n);if(fs.statSync(f).isFile())inputs.set(f,hash(f));}
const px=(a,b,c,d)=>[a/62.5,b/20,c/62.5,d/20];
function projection(es,side='north',value=255){const out=new Set();for(const e of es)if(e.faces[side])for(let y=Math.min(e.from[1],e.to[1]);y<Math.max(e.from[1],e.to[1]);y++)for(let x=Math.min(e.from[0],e.to[0]);x<Math.max(e.from[0],e.to[0]);x++){const c=pixel(...uv(e,side,[x+.5,y+.5,8]),atlas);if(c[3]>128&&c[0]===value)out.add(x+','+y);}return out;}
const whites=es=>es.filter(e=>positive(e)&&e.faces.north&&projection([e]).size);
const moved=(es,dx,dy)=>structuredClone(es).map(e=>{for(const k of ['from','to']){e[k][0]+=dx;e[k][1]+=dy;}if(e.rotation){assert.equal(e.rotation.angle,0);e.rotation.origin[0]+=dx;e.rotation.origin[1]+=dy;}for(const f of Object.values(e.faces))f.texture='#0';return e;});
const cellBox=cells=>{const ps=[...cells].map(k=>k.split(',').map(Number));return[Math.min(...ps.map(p=>p[0])),Math.min(...ps.map(p=>p[1])),Math.max(...ps.map(p=>p[0]))+1,Math.max(...ps.map(p=>p[1]))+1];};
// Crop a positive front/back rectangle while keeping its exact texel scale.
// The standalone mark is untouched; only duplicate contact texels are omitted.
function crop(e,[x0,y0,x1,y1]){
 const out=structuredClone(e);out.from=[x0,y0,e.from[2]];out.to=[x1,y1,e.to[2]];
 for(const side of ['north','south'])if(e.faces[side]){
  const a=uv(e,side,[side==='north'?x1:x0,y1,8]),b=uv(e,side,[side==='north'?x0:x1,y0,8]);out.faces[side].uv=[...a,...b];
 }
 for(const side of ['up','down'])if(e.faces[side]){
  const y=side==='up'?y1:y0;
  if(y!==(side==='up'?e.to[1]:e.from[1]))delete out.faces[side];
  else{const a=uv(e,side,[x0,y,side==='up'?e.from[2]:e.to[2]]),b=uv(e,side,[x1,y,side==='up'?e.to[2]:e.from[2]]);out.faces[side].uv=[...a,...b];}
 }
 assert.ok(!e.faces.east&&!e.faces.west,'Mark crop requires front/back/cap-only template');return out;
}
function removeDuplicateWhite(e,placed){
 const own=projection([e]),overlap=[...own].filter(k=>placed.has(k));if(!overlap.length)return[e];
 const cutoff=Math.max(...overlap.map(k=>Number(k.split(',')[1])))+1;
 const upper=cutoff<e.to[1]?[crop(e,[e.from[0],cutoff,e.to[0],e.to[1]])]:[];
 const remaining=new Set([...own].filter(k=>!placed.has(k)&&Number(k.split(',')[1])<cutoff));
 const rects=[];for(let y=e.from[1];y<cutoff;y++){let x=e.from[0];while(x<e.to[0]){if(!remaining.has(x+','+y)){x++;continue;}const a=x;while(x<e.to[0]&&remaining.has(x+','+y))x++;const prior=rects.find(r=>r[0]===a&&r[2]===x&&r[3]===y);if(prior)prior[3]++;else rects.push([a,y,x,y+1]);}}
 const result=[...upper,...rects.map(r=>crop(e,r))],wanted=new Set([...own].filter(k=>!placed.has(k)));
 assert.deepEqual(projection(result),wanted,'Cropping changed the visible mark');return result;
}
// Index existing horizontal/vertical black/transparent strips. Integer run
// compression preserves alpha boundaries exactly without atlas additions.
const lines=[[],[]],cache=new Map();
const charAt=(x,y)=>{const c=atlas.subarray((y*1000+x)*4,(y*1000+x)*4+4);return c[3]<128?'0':c[0]===0&&c[1]===0&&c[2]===0?'1':'x';};
for(let y=0;y<320;y++)lines[0].push(Array.from({length:1000},(_,x)=>charAt(x,y)).join(''));
for(let x=0;x<1000;x++)lines[1].push(Array.from({length:320},(_,y)=>charAt(x,y)).join(''));
function strip(mask,vertical=false){
 if(!mask.some(Boolean))return null;
 const wanted=mask.map(Number).join(''),k=vertical+':'+wanted;if(cache.has(k))return cache.get(k);
 const patterns=[wanted];
 for(let stride=2;stride<=mask.length;stride++)if(mask.length%stride===0){let valid=true;for(let i=0;i<mask.length;i++)if(mask[i]!==mask[Math.floor(i/stride)*stride]){valid=false;break;}if(valid)patterns.push(Array.from({length:mask.length/stride},(_,i)=>Number(mask[i*stride])).join(''));}
 for(const pattern of patterns)for(const flip of [false,true]){const s=mask.every(Boolean)?'1':flip?[...pattern].reverse().join(''):pattern;for(let row=0;row<lines[Number(vertical)].length;row++){const at=lines[Number(vertical)][row].indexOf(s);if(at<0)continue;const length=s.length;const result=vertical?px(row,at+(flip?length:0),row+1,at+(flip?0:length)):px(at+(flip?length:0),row,at+(flip?0:length),row+1);cache.set(k,result);return result;}}
 throw Object.assign(Error('No existing black/alpha strip '+k),{mask,vertical});
}
function shell(r,occupied){const[a,b,c,d]=r,faces={north:{uv:strip([1]),texture:'#0'},south:{uv:strip([1]),texture:'#0'}};
 const masks={east:Array.from({length:d-b},(_,i)=>!occupied.has((a-1)+','+(b+i))),west:Array.from({length:d-b},(_,i)=>!occupied.has(c+','+(b+i))),up:Array.from({length:c-a},(_,i)=>!occupied.has((c-1-i)+','+(b-1))),down:Array.from({length:c-a},(_,i)=>!occupied.has((c-1-i)+','+d))};
 for(const [side,mask]of Object.entries(masks)){const u=strip(mask,side==='east'||side==='west');if(u)faces[side]={uv:u,texture:'#0'};}return{from:[c,d,18],to:[a,b,-2],faces};
}
function shells(rectangles,occupied){const memo=new Map();function solve(r){const key=r.join(',');if(memo.has(key))return memo.get(key);let fail;try{const out=[shell(r,occupied)];memo.set(key,out);return out;}catch(e){if(!e.mask)throw e;fail=e;}
 const[a,b,c,d]=r,start=fail.vertical?b:a;let best;for(let i=1;i<fail.mask.length;i++)if(fail.mask[i]!==fail.mask[i-1]){const cut=start+i,one=fail.vertical?[a,b,c,cut]:[a,b,cut,d],two=fail.vertical?[a,cut,c,d]:[cut,b,c,d],out=[...solve(one),...solve(two)];if(!best||out.length<best.length)best=out;}
 assert.ok(best,'Cannot partition '+key);memo.set(key,best);return best;}return rectangles.flatMap(solve);}
const markNames={'\u0300':'grave','\u0301':'acute','\u0303':'~','\u0309':'hookabove','\u0323':'.'};
const plans=[];let shellSamples=0;
function make(name,char,creeper=false){
 const source=read(thin,creeper?name:char),nfd=char.toLowerCase().normalize('NFD'),baseName=creeper?'creeper':nfd.includes('\u031b')?(nfd[0]==='o'?'ơ':'ư'):nfd[0];
 const names=[baseName,nfd.includes('\u0302')?'^':nfd.includes('\u0306')?'breve':null,Object.entries(markNames).find(([code])=>nfd.includes(code))?.[1]].filter(Boolean);
 const sourcePos=source.elements.filter(e=>positive(e)&&e.faces.north&&thinWhite([e]).size),parts=[];let cursor=0;
 for(const partName of names){
  const old=read(thin,partName),oldPos=old.elements.filter(e=>positive(e)&&e.faces.north&&thinWhite([e]).size),sourceGroup=sourcePos.slice(cursor,cursor+oldPos.length);cursor+=oldPos.length;
  assert.equal(sourceGroup.length,oldPos.length,char+' source part '+partName);
  for(let i=0;i<oldPos.length;i++)assert.deepEqual(sourceGroup[i].faces.north.uv,oldPos[i].faces.north.uv,char+' identify part '+partName);
  const oldBox=cellBox(thinWhite(oldPos)),placedBox=cellBox(thinWhite(sourceGroup)),newModel=read(font,partName),newPos=whites(newModel.elements),newBox=cellBox(projection(newPos));
  // Bold expands one pixel around each authored cell; keep the source centers,
  // with +1 Y to retain the original letter baseline at Y=2.
  const dx=(placedBox[0]+placedBox[2]-newBox[0]-newBox[2])/2;
  const dy=(placedBox[1]+placedBox[3]-newBox[1]-newBox[3])/2+1;
  assert.ok(Number.isInteger(dx)&&Number.isInteger(dy),char+' off-grid placement');
  const es=moved(newPos,dx,dy);parts.push({name:partName,es,dx,dy,oldBox,placedBox});
  if(partName!=='creeper'){
   const expected=new Set();for(const k of thinWhite(sourceGroup)){const[x,y]=k.split(',').map(Number);for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++)expected.add((x+i)+','+(y+j+1));}
   assert.deepEqual(projection(es),expected,char+' authored Bold shape '+partName);
  }
 }
 assert.equal(cursor,sourcePos.length,char+' unmatched source cubes');
 const base=parts[0];
 // Keep the stroke reference's touching layout. Deduplicate front texels
 // instead of raising the mark, retaining exactly the same visible union.
 const referenceInk=projection(parts.flatMap(p=>p.es));
 const placed=new Set(projection(base.es));
 for(const part of parts.slice(1)){
  part.es=part.es.flatMap(e=>{const out=removeDuplicateWhite(e,placed);for(const k of projection(out))placed.add(k);return out;});
 }
 assert.deepEqual(projection(parts.flatMap(p=>p.es)),referenceInk,char+' stroke silhouette changed');
 const upper=parts.slice(1).filter(p=>p.name!=='.');
 const highest=upper.length?Math.max(...upper.flatMap(p=>p.es.map(e=>e.to[1]))):-Infinity;
 for(const part of parts.slice(1))for(const e of part.es){if(part.name==='.'){delete e.faces.up;}else{delete e.faces.down;if(e.to[1]!==highest)delete e.faces.up;}}
 const es=parts.flatMap(p=>p.es),ink=projection(es),baseInk=projection(base.es),markInk=projection(parts.slice(1).flatMap(p=>p.es));
 assert.equal(ink.size,baseInk.size+markInk.size,char+' white parts overlap');
 // Preserve the author's special Creeper eye-hole and corner construction.
 // Ordinary letters use an exact minimum rectangular cover of their outline.
 let border,occupied,minimum;
 if(creeper){
  const native=read(font,'creeper'),baseElements=moved(native.elements,base.dx,base.dy);
  // Keep the authored front/back black coverage, including Creeper eye holes.
  // Rebuild the shell so contact masks can use the existing atlas by partition.
  const nativeBlack=projection(baseElements,'north',0);
  occupied=new Set([...nativeBlack,...baseInk,...dilate(markInk)]);
  const solution=cover(occupied);border=shells(solution.rectangles,occupied);minimum=border.length===solution.rectangles.length;
 }else{occupied=dilate(ink);const solution=cover(occupied);border=shells(solution.rectangles,occupied);minimum=border.length===solution.rectangles.length;}
 const elements=[...es,...border],b=bounds(elements),center=8-(b[0][0]+b[0][1])/2;
 for(const e of elements){for(const k of ['from','to'])e[k][0]+=center;if(e.rotation)e.rotation.origin[0]+=center;}
 const expected=new Set([...ink].map(k=>{const[x,y]=k.split(',').map(Number);return(x+center)+','+y;}));
 for(const side of ['north','south']){
  assert.deepEqual(projection(es,side),expected,char+' front/back');
  const black=projection(border,side,0),desired=new Set([...occupied].map(k=>{const[x,y]=k.split(',').map(Number);return(x+center)+','+y;}));
  assert.deepEqual(black,desired,char+' exact outline coverage');
 }
 const box=bounds(elements);assert.equal((box[0][0]+box[0][1])/2,8);assert.equal((box[2][0]+box[2][1])/2,8);
 const shifted=new Set([...occupied].map(k=>{const[x,y]=k.split(',').map(Number);return(x+center)+','+y;}));
 // Verify every generated negative face at fractional positions through depth.
 for(const e of border.filter(e=>!positive(e)&&e.faces.north?.uv.every((v,i)=>Math.abs(v-strip([1])[i])<1e-8))){const[a,b]=e.to,[c,d]=e.from;for(const side of ['east','west','up','down']){const h=side==='up'||side==='down';for(let s=(h?a:b)+.0625;s<(h?c:d);s+=.125)for(const z of [-1.75,4.25,11.75,17.75]){let p,q;if(side==='east'){p=[a,s,z];q=(a-1)+','+Math.floor(s);}if(side==='west'){p=[c,s,z];q=c+','+Math.floor(s);}if(side==='up'){p=[s,b,z];q=Math.floor(s)+','+(b-1);}if(side==='down'){p=[s,d,z];q=Math.floor(s)+','+d;}const alpha=e.faces[side]?pixel(...uv(e,side,p),atlas)[3]:0;assert.equal(alpha>128,!shifted.has(q),char+' internal wall '+side);shellSamples++;}}}
 const model={credit:'By Ewan Howell & bl205vn',texture_size:[1000,320],textures:{'0':'minecraft-five-bold-vietnamese:flat'},elements};
 const file=path.join(dir,name+'.json');if(fs.existsSync(file)&&!update)assert.deepEqual(JSON.parse(fs.readFileSync(file)),model,'Use --update-generated to back up and replace '+name);
 plans.push({name,char,model,file,cubes:elements.length,minimumRectangularCover:minimum,parts:parts.map(p=>({name:p.name,shift:[p.dx,p.dy],collisionAdjustment:p.collisionAdjustment??0}))});
}
const baseLetters=new Set(['a','e','i','o','u','y','ơ','ư']);
for(const n of fs.readdirSync(path.join(thin,'characters'))){const ch=n.slice(0,-5);if(!n.endsWith('.json')||[...ch].length!==1||baseLetters.has(ch))continue;const nfd=ch.normalize('NFD');if('aeiouy'.includes(nfd[0])&&nfd.length>1)make(ch,ch);}
assert.equal(plans.length,64);
for(const[name,ch]of Object.entries(vietnameseCreeperCharacters))make(name,ch,true);
assert.equal(plans.length,81);
// Check every completed glyph in the supplied A/E/I stroke sheet. Remaining
// O/U/Y and Creeper forms inherit the same approved Five placement rules.
const referenceFile=path.join(font,'Các ký tự tiếng việt/Danh sách ký tự có dấu tiếng việt.png');
const reference=await sharp(referenceFile).ensureAlpha().raw().toBuffer({resolveWithObject:true});inputs.set(referenceFile,hash(referenceFile));
const referenceInk=(x,y)=>{const i=(y*reference.info.width+x)*4;return reference.data[i+3]>128&&reference.data[i]<128;};
let referenceGlyphs=0;
for(const [base,y,top,bottom,letters]of [['a',407,380,457,'àáãảạ'],['a',510,470,560,'âầấẫẩậ'],['a',618,580,670,'ăằắẵẳặ'],['e',721,680,780,'èéẽẻẹêềếễểệ'],['i',849,825,910,'ìíĩỉị']]){
 const template=whites(read(font,base).elements),b=cellBox(projection(template)),w=b[2]-b[0],h=b[3]-b[1],cells=projection(template),matches=[];
 for(let x=0;x<=reference.info.width-w;x++){let ok=true;for(let j=0;j<h&&ok;j++)for(let i=0;i<w;i++)if(referenceInk(x+i,y+j)!==cells.has((b[2]-i-1)+','+(b[3]-j-1))){ok=false;break;}if(ok)matches.push(x);}
 assert.equal(matches.length,[...letters].length,'Stroke reference body count '+letters);
 for(const[index,char]of [...letters].entries()){
  const model=plans.find(p=>p.char===char).model,body=model.elements[0],expected=new Set([...projection(model.elements)].map(k=>{const[xx,yy]=k.split(',').map(Number);return(matches[index]+body.to[0]-xx-1)+','+(y+body.to[1]-yy-1);}));
  const left=index?Math.floor((matches[index-1]+matches[index]+w)/2):0,right=index+1<matches.length?Math.floor((matches[index]+matches[index+1]+w)/2):reference.info.width,actual=new Set();
  for(let yy=top;yy<bottom;yy++)for(let xx=left;xx<right;xx++)if(referenceInk(xx,yy))actual.add(xx+','+yy);
  assert.deepEqual(expected,actual,char+' differs from the supplied stroke reference');referenceGlyphs++;
 }
}
for(const[f,h]of inputs)assert.equal(hash(f),h,'Protected input changed '+f);
const review=fs.mkdtempSync(path.join(root,'backups/five-bold-compose-'));
fs.writeFileSync(path.join(review,'input-hashes.json'),JSON.stringify(Object.fromEntries(inputs),null,2));
const layers=[],size=112,cols=9,rows=Math.ceil(plans.length/cols);
for(const[i,p]of plans.entries())layers.push({input:await render(p.model,[0,0,1],size,atlas),left:i%cols*size,top:Math.floor(i/cols)*130+18});
const labels=Buffer.from(`<svg width="${cols*size}" height="${rows*130+18}"><g fill="white" font-size="14" font-family="Arial">${plans.map((p,i)=>`<text x="${i%cols*size+6}" y="${Math.floor(i/cols)*130+16}">${p.char}</text>`).join('')}</g></svg>`);layers.push({input:labels,left:0,top:0});
await sharp({create:{width:cols*size,height:rows*130+18,channels:4,background:'#1c1e23'}}).composite(layers).png().toFile(path.join(review,'preview.png'));
const samples=['ả','ẳ','ự','ậ','Ả','Ẳ','Ặ'],angles=[];
for(const[i,ch]of samples.entries())for(const[j,d]of [[0,[0,0,1]],[1,[.5,-.7,1]],[2,[-.5,-.7,1]],[3,[.5,.7,1]],[4,[0,0,-1]]])angles.push({input:await render(plans.find(p=>p.char===ch).model,d,150,atlas),left:j*150,top:i*150});
await sharp({create:{width:750,height:samples.length*150,channels:4,background:'#1c1e23'}}).composite(angles).png().toFile(path.join(review,'angles.png'));
if(apply)for(const p of plans){if(fs.existsSync(p.file)){if(hash(p.file)===createHash('sha256').update(JSON.stringify(p.model,null,'\t')+'\n').digest('hex'))continue;assert.ok(update);fs.mkdirSync(path.join(review,'previous-models'),{recursive:true});fs.copyFileSync(p.file,path.join(review,'previous-models',p.name+'.json'));}fs.writeFileSync(p.file,JSON.stringify(p.model,null,'\t')+'\n');assert.deepEqual(JSON.parse(fs.readFileSync(p.file)),p.model);}
for(const[f,h]of inputs)if(!(apply&&plans.some(p=>p.file===f)))assert.equal(hash(f),h,'Existing input changed '+f);
const report={apply,ordinary:64,creeper:17,strokeReferenceLayout:true,referenceGlyphsPixelExact:referenceGlyphs,atlasAndStandaloneTemplatesUnchanged:true,shellSamples,guiVerified:false,models:plans.map(({name,char,cubes,minimumRectangularCover,parts})=>({name,char,cubes,minimumRectangularCover,parts})),review};
fs.writeFileSync(path.join(review,'report.json'),JSON.stringify(report,null,2));
fs.writeFileSync(path.join(root,'backups/five-bold-compose-last.txt'),review);
console.log(JSON.stringify({...report,models:undefined,minCubes:Math.min(...plans.map(p=>p.cubes)),maxCubes:Math.max(...plans.map(p=>p.cubes))},null,2));
