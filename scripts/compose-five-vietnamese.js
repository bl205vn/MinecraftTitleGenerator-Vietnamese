// Compose from the supplied pixel reference. Atlas and existing letters are inputs.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';import sharp from 'sharp';
import {white,dilate,cover,compatibleShells,bounds,positive,color} from './five-model-geometry.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),font=path.join(root,'fonts/minecraft-five-vietnamese'),dir=path.join(font,'characters');
const apply=process.argv.includes('--apply');assert.ok(process.argv.slice(2).every(a=>a==='--apply'));
const refFile=path.join(font,'Các ký tự tiếng việt/Danh sách ký tự có dấu tiếng việt.png');
const ref=await sharp(refFile).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const ink=(x,y)=>{if(x>=13&&x<101&&y>=9&&y<40)return false;if(x<0||x>=ref.info.width||y<0||y>=ref.info.height)return false;const i=(y*ref.info.width+x)*4;return ref.data[i+3]>128&&ref.data[i]<128;};
const snapshots=new Map(),hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
for(const sub of ['characters','textures','overlays'])if(fs.existsSync(path.join(font,sub)))for(const f of fs.readdirSync(path.join(font,sub))){const p=path.join(font,sub,f);if(fs.statSync(p).isFile())snapshots.set(p,hash(p));}snapshots.set(refFile,hash(refFile));
const read=n=>JSON.parse(fs.readFileSync(path.join(dir,n+'.json')));
const templates=new Map();function template(n){if(!templates.has(n)){const m=read(n),elements=m.elements.filter(e=>positive(e)&&e.faces.north&&white([e]).size);templates.set(n,{elements,cells:white(elements)});}return structuredClone(templates.get(n));}
function normalized(cells){const a=[...cells].map(p=>p.split(',').map(Number)),x0=Math.min(...a.map(p=>p[0])),x1=Math.max(...a.map(p=>p[0]))+1,y0=Math.min(...a.map(p=>p[1])),y1=Math.max(...a.map(p=>p[1]))+1;return{box:[x0,y0,x1,y1],w:x1-x0,h:y1-y0,pixels:a.map(([x,y])=>[x1-x-1,y1-y-1])};}
const core=Object.fromEntries(['a','e','i','o','u','y'].map(n=>[n,normalized(template(n).cells)]));
const rows=[['a',124,'àáãảạ'],['a',211,'âầấẫẩậ'],['a',305,'ăằắẵẳặ'],['e',381,'èéẽẻẹêềếễểệ'],['i',463,'ìíĩỉị'],['o',546,'òóõỏọôồốổỗộờớởỡợ'],['u',622,'ùúũủụừứữửự'],['y',711,'ỳýỹỷỵ']];
const helperAudit=[];
for(const n of ['đ','ư','ơ','hookabove','grave','breve','acute','^','~','.']){
 const model=read(n),b=bounds(model.elements),cells=white(model.elements);assert.equal((b[0][0]+b[0][1])/2,8,n+' center X');assert.equal((b[2][0]+b[2][1])/2,8,n+' center Z');assert.deepEqual(white(model.elements,'south'),cells,n+' reversed back face');
 for(const e of model.elements.filter(e=>positive(e)&&e.faces.north&&white([e]).size))for(const side of ['up','down'])if(e.faces[side]){const uv=e.faces[side].uv;assert.ok(uv[0]>uv[2]&&uv[1]>uv[3],n+' cap direction '+side);assert.ok(Math.abs((uv[1]-uv[3])*20-16)<1e-7,n+' cap depth '+side);const own=white([e]),yy=side==='up'?e.to[1]-1:e.from[1];for(let xx=e.from[0];xx<e.to[0];xx++)for(let z=0;z<16;z++){const u=(xx+.5-e.from[0])/(e.to[0]-e.from[0]),v=side==='up'?(z+.5)/16:1-(z+.5)/16,c=color((uv[0]+u*(uv[2]-uv[0]))*62.5,(uv[1]+v*(uv[3]-uv[1]))*20);assert.equal(c,own.has(xx+','+yy)?(side==='up'?176:84):-1,n+' cap mask '+side);}}
 helperAudit.push({name:n,centerXZ:[8,8],northSouthMatch:true,capOrientationAndDepthMatchOriginal:true});
}
const markNames={'\u0300':'grave','\u0301':'acute','\u0303':'~','\u0309':'hookabove','\u0323':'.'};
const generated=[],placements=[];
function exactAt(pattern,x,y){const want=new Set(pattern.pixels.map(([a,b])=>a+','+b));for(let yy=0;yy<pattern.h;yy++)for(let xx=0;xx<pattern.w;xx++)if(ink(x+xx,y+yy)!==want.has(xx+','+yy))return false;return true;}
for(const [base,bottom,letters]of rows){
 const pattern=core[base],top=bottom-30,positions=[];
 for(let x=0;x<=ref.info.width-pattern.w;x++)if(exactAt(pattern,x,top))positions.push(x);
 assert.equal(positions.length,[...letters].length,'Reference body count for '+letters+': '+positions);
 for(const[index,char]of [...letters].entries()){
  const x=positions[index],nfd=char.normalize('NFD'),baseName=nfd.includes('\u031b')?(base==='o'?'ơ':'ư'):base;
  const structure=nfd.includes('\u0302')?'^':nfd.includes('\u0306')?'breve':null,tone=Object.entries(markNames).find(([code])=>nfd.includes(code))?.[1];
  if(!structure&&!tone){assert.ok(fs.existsSync(path.join(dir,char+'.json')));continue;}
  const basePart=template(baseName),coreBox=bounds([basePart.elements[0]]);
  const parts=[{name:baseName,...basePart,dx:pattern.box[2]-coreBox[0][1],dy:pattern.box[3]-coreBox[1][1]}],ox=x+pattern.box[2],oy=top+pattern.box[3];
  const expectedRef=new Set();
  const addRef=(cells,dx=0,dy=0)=>{for(const p of cells){const[a,b]=p.split(',').map(Number),xx=ox-a-dx-1,yy=oy-b-dy-1;assert.ok(ink(xx,yy),char+' reference mismatch '+xx+','+yy);expectedRef.add(xx+','+yy);}};
  addRef(parts[0].cells,parts[0].dx,parts[0].dy);
  for(const name of [structure,tone].filter(Boolean)){
   const part=template(name),p=normalized(part.cells),y=name==='.'?bottom+6:top-18-(name===tone&&structure?18:0),candidates=[];
   for(let xx=Math.max(0,x-12);xx<=x+pattern.w+12-p.w;xx++)if(exactAt(p,xx,y))candidates.push(xx);
   candidates.sort((a,b)=>Math.abs(a+p.w/2-(x+pattern.w/2))-Math.abs(b+p.w/2-(x+pattern.w/2)));
   assert.ok(candidates.length,char+': no '+name+' silhouette at reference Y='+y);
   const xx=candidates[0],dx=ox-xx-p.box[2],dy=oy-y-p.box[3];parts.push({name,...part,dx,dy});addRef(part.cells,dx,dy);
  }
  const elements=[];
  for(const part of parts)for(const e of part.elements){for(const k of ['from','to']){e[k][0]+=part.dx;e[k][1]+=part.dy;}if(e.rotation){e.rotation.origin[0]+=part.dx;e.rotation.origin[1]+=part.dy;}for(const face of Object.values(e.faces))face.texture='#0';elements.push(e);}
  const cells=white(elements),expanded=dilate(cells),solution=cover(expanded);
  const shells=compatibleShells(solution.rectangles,expanded,'#0');
  const all=[...elements,...shells],b=bounds(all),dx=8-(b[0][0]+b[0][1])/2;
  for(const e of all){for(const k of ['from','to'])e[k][0]+=dx;if(e.rotation)e.rotation.origin[0]+=dx;}
  const model={credit:'By Ewan Howell & bl205vn',texture_size:[1000,320],textures:{'0':'minecraft-five-vietnamese:flat'},elements:all};
  const previousFaceMaskModel=structuredClone(model);
  // Match the accepted Ten composition policy: keep the base's caps, retain
  // only the uppermost cap in the upper-mark group, and dot-below's bottom.
  const upperParts=parts.slice(1).filter(p=>p.name!=='.'),highest=upperParts.length?Math.max(...upperParts.flatMap(p=>p.elements.map(e=>e.to[1]))):-Infinity;
  for(const part of parts.slice(1))for(const e of part.elements){if(part.name==='.'){delete e.faces.up;}else{delete e.faces.down;if(e.to[1]!==highest)delete e.faces.up;}}
  const shifted=new Set([...cells].map(p=>{const[a,b]=p.split(',').map(Number);return(a+dx)+','+b;}));assert.deepEqual(white(all),shifted);assert.deepEqual(white(all,'south'),shifted);
  // Project every white cell back onto the reference, independently of the
  // template placement bookkeeping. No supplied reference pixels are altered.
  const rendered=new Set([...white(all)].map(p=>{const[a,b]=p.split(',').map(Number);return(ox-a+dx-1)+','+(oy-b-1);}));assert.deepEqual(rendered,expectedRef,char+' final reference projection');
  placements.push({char,referenceBody:[x,top,pattern.w,30],parts:parts.map(p=>({name:p.name,shift:[p.dx,p.dy]})),centerShift:dx,whitePixels:cells.size,borderCubes:shells.length,cubes:all.length});
  generated.push({char,model,previousFaceMaskModel,referencePixels:expectedRef});
 }
}
assert.equal(generated.length,64);assert.equal(new Set(generated.map(g=>g.char)).size,64);
const coveredReference=new Set(generated.flatMap(g=>[...g.referencePixels]));
let referencePixels=0;for(let y=0;y<ref.info.height;y++)for(let x=0;x<ref.info.width;x++)if(ink(x,y)){referencePixels++;assert.ok(coveredReference.has(x+','+y),'Unassigned reference pixel '+x+','+y);}
assert.equal(coveredReference.size,referencePixels,'Reference glyph regions overlap');
for(const g of generated){const f=path.join(dir,g.char+'.json');if(fs.existsSync(f)){const old=JSON.parse(fs.readFileSync(f));assert.ok(JSON.stringify(old)===JSON.stringify(g.model)||JSON.stringify(old)===JSON.stringify(g.previousFaceMaskModel),'Refusing to overwrite edited output '+g.char);}}
for(const[p,h]of snapshots)assert.equal(hash(p),h,'Input changed: '+p);
const report={apply,generated:generated.length,ignoredReferenceRegion:[13,9,88,31],referencePixels,allReferenceInkAccountedFor:true,inputSHA256:Object.fromEntries(snapshots),helperAudit,placements,texturesUnchanged:true,guiVerified:false};
// A front preview drawn from the actual model UVs, including the negative shell.
const size=110,cols=8,rowsCount=Math.ceil(generated.length/cols),layers=[];
for(const[index,g]of generated.entries()){
 const b=bounds(g.model.elements),W=b[0][1]-b[0][0],H=b[1][1]-b[1][0],scale=Math.min(2,90/Math.max(W,H)),out=Buffer.alloc(size*size*4);for(let i=0;i<out.length;i+=4)out.set([35,38,43,255],i);
 for(const e of [...g.model.elements].sort((a,b)=>b.from[2]-a.from[2]))if(e.faces.north)for(let y=Math.min(e.from[1],e.to[1]);y<Math.max(e.from[1],e.to[1]);y++)for(let x=Math.min(e.from[0],e.to[0]);x<Math.max(e.from[0],e.to[0]);x++){
  const uv=e.faces.north.uv,u=(e.to[0]-x-.5)/(e.to[0]-e.from[0]),v=(e.to[1]-y-.5)/(e.to[1]-e.from[1]),c=color((uv[0]+u*(uv[2]-uv[0]))*62.5,(uv[1]+v*(uv[3]-uv[1]))*20);if(c<0)continue;const sx=(size-W*scale)/2+(b[0][1]-x-1)*scale,sy=18+(b[1][1]-y-1)*scale;for(let yy=Math.ceil(sy);yy<Math.ceil(sy+scale);yy++)for(let xx=Math.ceil(sx);xx<Math.ceil(sx+scale);xx++)if(xx>=0&&xx<size&&yy>=0&&yy<size)out.set([c,c,c,255],(yy*size+xx)*4);
 }
 layers.push({input:await sharp(out,{raw:{width:size,height:size,channels:4}}).png().toBuffer(),left:index%cols*size,top:Math.floor(index/cols)*size});
}
const labels=Buffer.from('<svg width="880" height="880"><g fill="white" font-family="Arial" font-size="13">'+generated.map((g,i)=>'<text x="'+(i%cols*size+8)+'" y="'+(Math.floor(i/cols)*size+14)+'">'+g.char+'</text>').join('')+'</g></svg>');layers.push({input:labels,left:0,top:0});
const preview=await sharp({create:{width:cols*size,height:rowsCount*size,channels:4,background:'#23262b'}}).composite(layers).png().toBuffer();
const review=fs.mkdtempSync(path.join(root,'backups/five-compose-review-'));fs.writeFileSync(path.join(review,'preview.png'),preview);fs.writeFileSync(path.join(review,'manifest.json'),JSON.stringify(report,null,2));
if(apply){for(const g of generated){const f=path.join(dir,g.char+'.json');if(fs.existsSync(f)){fs.mkdirSync(path.join(review,'previous-models'),{recursive:true});fs.copyFileSync(f,path.join(review,'previous-models',g.char+'.json'));}fs.writeFileSync(f,JSON.stringify(g.model,null,'\t')+'\n');}for(const[p,h]of snapshots)if(!generated.some(g=>p===path.join(dir,g.char+'.json')))assert.equal(hash(p),h,'Existing input modified: '+p);}
fs.writeFileSync(path.join(root,'backups/five-compose-review-last.txt'),review);
console.log(JSON.stringify({apply,generated:64,minCubes:Math.min(...placements.map(p=>p.cubes)),maxCubes:Math.max(...placements.map(p=>p.cubes)),helperAudit,review},null,2));
