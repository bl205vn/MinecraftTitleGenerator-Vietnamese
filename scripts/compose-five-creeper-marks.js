// Reuse the approved Five accent placements, replacing only the base with Creeper A.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';import sharp from 'sharp';
import {vietnameseCreeperCharacters} from './vietnamese-character-map.js';
import {white,dilate,cover,compatibleShells,bounds,positive,strip} from './five-model-geometry.js';
import {render,cells,uv,pixel} from './five-offline-render.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),font=path.join(root,'fonts/minecraft-five-vietnamese'),dir=path.join(font,'characters'),apply=process.argv.includes('--apply');
assert.ok(process.argv.slice(2).every(a=>a==='--apply'));
const inputs=new Map(),hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
for(const sub of ['characters','textures','overlays'])if(fs.existsSync(path.join(font,sub)))for(const f of fs.readdirSync(path.join(font,sub))){const p=path.join(font,sub,f);if(fs.statSync(p).isFile())inputs.set(p,hash(p));}
const original=JSON.parse(fs.readFileSync(path.join(dir,'creeper.json'))),creeper=original.elements.filter(e=>positive(e)&&e.faces.north&&white([e]).size);assert.equal(creeper.length,1);
assert.deepEqual(creeper[0].faces.north.uv,[0,.8,.48,2.3],'Creeper must use 0,16 30x30');
const plans=[];let shellSamples=0;
for(const [stem,char]of Object.entries(vietnameseCreeperCharacters)){
 const normal=JSON.parse(fs.readFileSync(path.join(dir,char.toLowerCase()+'.json'))),es=normal.elements.filter(e=>positive(e)&&e.faces.north&&white([e]).size).map(e=>structuredClone(e)),oldBase=es[0],base=structuredClone(creeper[0]);
 assert.deepEqual(base.to.map((v,i)=>v-base.from[i]),oldBase.to.map((v,i)=>v-oldBase.from[i]));
 const shift=oldBase.from.map((v,i)=>v-base.from[i]);for(const k of ['from','to'])base[k]=base[k].map((v,i)=>v+shift[i]);if(base.rotation)base.rotation.origin=base.rotation.origin.map((v,i)=>v+shift[i]);for(const f of Object.values(base.faces))f.texture='#0';es[0]=base;
 const ink=white(es),markInk=white(es.slice(1)),markOutline=dilate(markInk),baseShells=original.elements.filter(e=>!positive(e)).map(e=>structuredClone(e)),occupied=new Set(markOutline);
 for(const e of baseShells){for(const k of ['from','to'])e[k]=e[k].map((v,i)=>v+shift[i]);if(e.rotation)e.rotation.origin=e.rotation.origin.map((v,i)=>v+shift[i]);for(const f of Object.values(e.faces))f.texture='#0';for(let y=e.to[1];y<e.from[1];y++)for(let x=e.to[0];x<e.from[0];x++)occupied.add(x+','+y);}
 // Preserve the author's original border UVs except where an added mark meets
 // them. Only those contact sections are hidden, using existing black masks.
 for(const e of baseShells){const[x1,y1]=e.from,[x0,y0]=e.to;for(const side of ['east','west','up','down'])if(e.faces[side]){
  const horizontal=side==='up'||side==='down',lo=horizontal?x0:y0,hi=horizontal?x1:y1,mask=[],previous=[];
  for(let j=0;j<hi-lo;j++){const s=horizontal?hi-j-.5:lo+j+.5;let p,q;if(side==='east'){p=[x0,s,8];q=(x0-1)+','+Math.floor(s);}if(side==='west'){p=[x1,s,8];q=x1+','+Math.floor(s);}if(side==='up'){p=[s,y0,8];q=Math.floor(s)+','+(y0-1);}if(side==='down'){p=[s,y1,8];q=Math.floor(s)+','+y1;}const old=Number(pixel(...uv(e,side,p))[3]>128);previous.push(old);mask.push(markOutline.has(q)?0:old);}
  if(mask.some((v,i)=>v!==previous[i])){const fitted=strip(mask,0,!horizontal);if(fitted)e.faces[side].uv=fitted;else delete e.faces[side];}
 }}
 const rects=cover(markOutline),markShells=compatibleShells(rects.rectangles,occupied,'#0'),negative=[...baseShells,...markShells],elements=[...es,...negative],b=bounds(elements),dx=8-(b[0][0]+b[0][1])/2;
 for(const e of elements){for(const k of ['from','to'])e[k][0]+=dx;if(e.rotation)e.rotation.origin[0]+=dx;}
 const model={credit:'By Ewan Howell & bl205vn',texture_size:[1000,320],textures:{'0':'minecraft-five-vietnamese:flat'},elements};
 const expected=new Set([...ink].map(p=>{const[x,y]=p.split(',').map(Number);return(x+dx)+','+y;})),expanded=new Set([...occupied].map(p=>{const[x,y]=p.split(',').map(Number);return(x+dx)+','+y;}));
 const bb=bounds(elements);assert.equal((bb[0][0]+bb[0][1])/2,8);assert.equal((bb[2][0]+bb[2][1])/2,8);
 for(const side of ['north','south']){const p=cells(model,side),baseProjection=cells({elements:baseShells},side).black,desired=new Set([...baseProjection,...[...markOutline].map(k=>{const[x,y]=k.split(',').map(Number);return(x+dx)+','+y;})]);assert.deepEqual(p.white,expected,stem+' face mismatch');assert.equal([...desired].filter(k=>!p.white.has(k)&&!p.black.has(k)).length,0,stem+' missing border');assert.equal([...p.black].filter(k=>!desired.has(k)).length,0,stem+' extra border');}
 // Marks retain every UV and enabled face from the corresponding regular A.
 const marks=normal.elements.filter(e=>positive(e)&&e.faces.north&&white([e]).size).slice(1);for(let i=0;i<marks.length;i++){const actual=structuredClone(es[i+1]);for(const k of ['from','to'])actual[k][0]-=dx;if(actual.rotation)actual.rotation.origin[0]-=dx;assert.deepEqual(actual,marks[i],stem+' altered mark');}
 for(const e of markShells){const[x1,y1]=e.from,[x0,y0]=e.to;for(const side of ['east','west','up','down']){const horizontal=side==='up'||side==='down',lo=horizontal?x0:y0,hi=horizontal?x1:y1;for(let s=lo+.0625;s<hi;s+=.125)for(const z of [-1.75,4.25,11.75,17.75]){let p,outside;if(side==='east'){p=[x0,s,z];outside=!expanded.has((x0-1)+','+Math.floor(s));}if(side==='west'){p=[x1,s,z];outside=!expanded.has(x1+','+Math.floor(s));}if(side==='up'){p=[s,y0,z];outside=!expanded.has(Math.floor(s)+','+(y0-1));}if(side==='down'){p=[s,y1,z];outside=!expanded.has(Math.floor(s)+','+y1);}const c=e.faces[side]?pixel(...uv(e,side,p)):[0,0,0,0];assert.equal(c[3]>128,outside,stem+' internal black cap');if(c[3])assert.equal(c[0],0);shellSamples++;}}}
 const oldShells=original.elements.filter(e=>!positive(e));
 const movedMarks=new Set([...markOutline].map(k=>{const[x,y]=k.split(',').map(Number);return(x+dx)+','+y;}));
 for(let i=0;i<baseShells.length;i++){const e=baseShells[i],old=oldShells[i],[x1,y1]=e.from,[x0,y0]=e.to;for(const side of ['east','west','up','down']){const horizontal=side==='up'||side==='down',lo=horizontal?x0:y0,hi=horizontal?x1:y1;for(let s=lo+.0625;s<hi;s+=.125)for(const z of [-1.75,4.25,11.75,17.75]){let p,q;if(side==='east'){p=[x0,s,z];q=(x0-1)+','+Math.floor(s);}if(side==='west'){p=[x1,s,z];q=x1+','+Math.floor(s);}if(side==='up'){p=[s,y0,z];q=Math.floor(s)+','+(y0-1);}if(side==='down'){p=[s,y1,z];q=Math.floor(s)+','+y1;}const sourcePoint=p.map((v,a)=>v-shift[a]-(a===0?dx:0)),oldAlpha=old.faces[side]?pixel(...uv(old,side,sourcePoint))[3]:0,actual=e.faces[side]?pixel(...uv(e,side,p))[3]:0;assert.equal(actual,movedMarks.has(q)?0:oldAlpha,stem+' base border contact '+side);shellSamples++;}}}
 const file=path.join(dir,stem+'.json');if(fs.existsSync(file))assert.deepEqual(JSON.parse(fs.readFileSync(file)),model,'Refusing to overwrite edited '+stem);
 plans.push({stem,char,file,model,cubes:elements.length,borderCubes:negative.length});
}
assert.equal(plans.length,17);for(const[f,h]of inputs)assert.equal(hash(f),h,'Input changed: '+f);
const review=fs.mkdtempSync(path.join(root,'backups/five-creeper-marks-'));fs.writeFileSync(path.join(review,'input-hashes.json'),JSON.stringify(Object.fromEntries(inputs),null,2));fs.copyFileSync(path.join(dir,'creeper.json'),path.join(review,'creeper-original.json'));
const layers=[],size=140,cols=6;for(const[i,p]of plans.entries())layers.push({input:await render(p.model,[0,0,1],size),left:i%cols*size,top:Math.floor(i/cols)*size});
const label=Buffer.from('<svg width="840" height="420"><g fill="white" font-size="14" font-family="Arial">'+plans.map((p,i)=>'<text x="'+(i%cols*size+5)+'" y="'+(Math.floor(i/cols)*size+16)+'">'+p.char+'</text>').join('')+'</g></svg>');layers.push({input:label,left:0,top:0});await sharp({create:{width:840,height:420,channels:4,background:'#1c1e23'}}).composite(layers).png().toFile(path.join(review,'preview.png'));
const angleLayers=[],samples=['Ả','Ẩ','Ẳ','Ặ'];for(const[i,char]of samples.entries()){const model=plans.find(p=>p.char===char).model;for(const[j,d]of [[0,[0,0,1]],[1,[.5,-.7,1]],[2,[-.5,-.7,1]],[3,[.5,.7,1]],[4,[0,0,-1]]])angleLayers.push({input:await render(model,d),left:j*160,top:i*180+24});}
const al=Buffer.from('<svg width="800" height="744"><g fill="white" font-size="15" font-family="Arial"><text x="4" y="17">FRONT</text><text x="164" y="17">ABOVE RIGHT</text><text x="324" y="17">ABOVE LEFT</text><text x="484" y="17">BELOW</text><text x="644" y="17">BACK</text>'+samples.map((c,i)=>'<text x="4" y="'+(i*180+40)+'">'+c+'</text>').join('')+'</g></svg>');angleLayers.push({input:al,left:0,top:0});await sharp({create:{width:800,height:744,channels:4,background:'#1c1e23'}}).composite(angleLayers).png().toFile(path.join(review,'angles.png'));
if(apply)for(const p of plans)if(!fs.existsSync(p.file))fs.writeFileSync(p.file,JSON.stringify(p.model,null,'\t')+'\n',{flag:'wx'});
for(const[f,h]of inputs)assert.equal(hash(f),h,'Existing input modified: '+f);
const report={apply,models:plans.map(p=>({file:p.stem+'.json',character:p.char,cubes:p.cubes,borderCubes:p.borderCubes})),sourceAtlas:[0,16,30,30],existingInputsUnchanged:true,markPlacementsUVAndCapMasksPreserved:true,centerXZ8:true,border2px:true,shellSubpixelSamples:shellSamples,guiVerified:false,review};fs.writeFileSync(path.join(review,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'backups/five-creeper-marks-last.txt'),review);console.log(JSON.stringify(report,null,2));
