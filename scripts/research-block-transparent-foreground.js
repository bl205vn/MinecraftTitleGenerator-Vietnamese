// Review-only prototype: bake a complete Block surface before assigning UVs.
// Fresh output texture per sample row; reusable source atlas stays unchanged.
// The user's font files, models, Flat and plugin are never changed here.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {render,uv,pixel} from './five-offline-render.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),font=path.join(root,'fonts/minecraft-five-bold-block-vietnamese'),original=path.join(root,'fonts/minecraft-five-bold-block');
assert.equal(process.argv.length,2,'This script creates review artifacts only; there is no apply option.');
const hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex'),inputs=new Map();
for(const base of [font,original])for(const sub of ['characters','textures','overlays'])if(fs.existsSync(path.join(base,sub)))for(const n of fs.readdirSync(path.join(base,sub))){const f=path.join(base,sub,n);if(fs.statSync(f).isFile())inputs.set(f,hash(f));}
const read=(base,n)=>JSON.parse(fs.readFileSync(path.join(base,'characters',n+'.json')));
const decode=async f=>{const r=await sharp(f).ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.deepEqual([r.info.width,r.info.height],[1000,320]);return r.data;};
const flat=await decode(path.join(font,'textures/flat.png')),nativeFlat=await decode(path.join(original,'textures/flat.png'));
const px=(a,b,c,d)=>[a/62.5,b/20,c/62.5,d/20],rgba=(data,x,y)=>[...data.subarray((y*1000+x)*4,(y*1000+x)*4+4)],put=(data,x,y,c)=>data.set(c,(y*1000+x)*4);
function white(model,image=flat){const out=new Set();for(const e of model.elements)if(e.faces.north)for(let y=e.from[1];y<e.to[1];y++)for(let x=e.from[0];x<e.to[0];x++){const c=pixel(...uv(e,'north',[x+.5,y+.5,8]),image);if(c[3]===255&&c[0]===255&&c[1]===255&&c[2]===255)out.add(x+','+y);}return out;}
function bounds(model){return[0,1,2].map(i=>[Math.min(...model.elements.flatMap(e=>[e.from[i],e.to[i]])),Math.max(...model.elements.flatMap(e=>[e.from[i],e.to[i]]))]);}

// Research only: one background cube plus transparent foreground components.
const review=fs.mkdtempSync(path.join(root,'backups/block-transparent-foreground-research-'));fs.mkdirSync(path.join(review,'blockbench'));fs.mkdirSync(path.join(review,'textures'));fs.mkdirSync(path.join(review,'candidate-models'));
const names=fs.readdirSync(path.join(font,'characters')).filter(n=>n.endsWith('.json')).map(n=>n.slice(0,-5)).filter(n=>n.startsWith('creeper_')||([...n].length===1&&n.normalize('NFD').length>1&&'aeiouy'.includes(n.normalize('NFD')[0])&&!['ơ','ư'].includes(n)));
const records=[];
for(const name of names){const source=read(font,name),[[a,c],[b,d]]=bounds(source),W=c-a,fx=575+Math.floor((48-W)/2),groups=new Map();
 for(const e of source.elements){if(!e.name?.startsWith('glyph_'))continue;const[u,v]=uv(e,'north',[e.from[0]+.5,e.from[1]+.5,8]),ox=Math.floor(u*62.5+1e-8)+e.from[0],oy=Math.floor(v*20+1e-8)+e.from[1],key=ox+','+oy;let g=groups.get(key);if(!g)groups.set(key,g={ox,oy,a:Infinity,b:Infinity,c:-Infinity,d:-Infinity,parts:[],allowed:new Set()});g.parts.push({a:e.from[0],b:e.from[1],c:e.to[0],d:e.to[1],ox,oy});for(let yy=e.from[1];yy<e.to[1];yy++)for(let xx=e.from[0];xx<e.to[0];xx++)g.allowed.add(xx+','+yy);g.a=Math.min(g.a,e.from[0]);g.b=Math.min(g.b,e.from[1]);g.c=Math.max(g.c,e.to[0]);g.d=Math.max(g.d,e.to[1]);}
 const f=(u,texture='#0')=>({uv:u,texture}),background={name:'shared_background',from:[a,b,0],to:[c,d,16],faces:{north:f(px(fx,180+88-d,fx+W,180+88-b)),south:f(px(fx+W,180+88-d,fx,180+88-b)),up:f(px(fx+W,180,fx,164)),down:f(px(fx+W,296,fx,280))}},foreground=[...groups.values()].flatMap(g=>{const found=new Set();for(let y=g.b;y<g.d;y++)for(let x=g.a;x<g.c;x++){const color=rgba(flat,g.ox-x,g.oy-y);if(color[0]===255&&color[1]===255&&color[2]===255&&color[3]===255)found.add(x+','+y);}return found.size===g.allowed.size&&[...found].every(k=>g.allowed.has(k))?[g]:g.parts;}).map((g,i)=>{const sx=g.ox-g.c+1,sy=g.oy-g.d+1,w=g.c-g.a,h=g.d-g.b;return{name:'transparent_ink_'+i,from:[g.a,g.b,-.01],to:[g.c,g.d,16.01],faces:{north:f(px(sx,sy,sx+w,sy+h),'#1'),south:f(px(sx+w,sy,sx,sy+h),'#1')}};});
 const model={texture_size:[1000,320],elements:[background,...foreground]},actual=new Set();let overlaps=0;for(const e of foreground)for(let y=e.from[1];y<e.to[1];y++)for(let x=e.from[0];x<e.to[0];x++){const color=pixel(...uv(e,'north',[x+.5,y+.5,8]),flat);if(color[0]===255&&color[1]===255&&color[2]===255&&color[3]===255){if(actual.has(x+','+y))overlaps++;actual.add(x+','+y);}}
 assert.deepEqual(actual,white(source),name+' mask changed');assert.equal(overlaps,0,name+' visible foreground overlap');records.push({name,model,oldCubes:source.elements.length,newCubes:model.elements.length,foregroundParts:foreground.length});
}

for(const r of records)fs.writeFileSync(path.join(review,'candidate-models',r.name+'.json'),JSON.stringify(r.model,null,2));
let verifiedPixels=0;
for(const file of fs.readdirSync(path.join(font,'textures')).filter(n=>n.endsWith('.png')&&n!=='overlay.png')){
 const image=await decode(path.join(font,'textures',file));
 for(const r of records){const originalModel=read(font,r.name),[[a,c],[b,d]]=bounds(originalModel);
 for(const side of ['north','south'])for(let y=b;y<d;y++)for(let x=a;x<c;x++){
  const oldElement=originalModel.elements.find(e=>x>=e.from[0]&&x<e.to[0]&&y>=e.from[1]&&y<e.to[1]&&e.faces[side]);
  const want=[...pixel(...uv(oldElement,side,[x+.5,y+.5,8]),image)];
  let got=[...pixel(...uv(r.model.elements[0],side,[x+.5,y+.5,8]),image)];
  for(const e of r.model.elements.slice(1))if(x>=e.from[0]&&x<e.to[0]&&y>=e.from[1]&&y<e.to[1]){const q=uv(e,side,[x+.5,y+.5,8]),c=pixel(...q,flat);if(c[0]===255&&c[1]===255&&c[2]===255&&c[3]===255)got=[...pixel(...q,image)];}
  assert.deepEqual(got,want,file+'/'+r.name+'/'+side+' composite differs');verifiedPixels++;
 }
 }
}
for(const style of ['flat','acacia_planks','live','neon']){const image=style==='flat'?flat:await decode(path.join(font,'textures',style+'.png')),ink=Buffer.alloc(image.length);for(let k=0;k<flat.length;k+=4)if(flat[k]===255&&flat[k+1]===255&&flat[k+2]===255&&flat[k+3]===255)image.copy(ink,k,k,k+4);
 const mainPNG=await sharp(image,{raw:{width:1000,height:320,channels:4}}).png().toBuffer(),inkPNG=await sharp(ink,{raw:{width:1000,height:320,channels:4}}).png().toBuffer();fs.writeFileSync(path.join(review,'textures',style+'-ink.png'),inkPNG);
 const elements=[],groups=[],outliner=[],selected=['á','ẳ','ặ','ự','creeper_breve_hookabove'];for(const[i,name]of selected.entries()){const p=records.find(r=>r.name===name),g=randomUUID(),ids=[];for(const source of p.model.elements){const e=structuredClone(source),id=randomUUID();for(const k of ['from','to'])e[k][0]+=i*56;elements.push({...e,uuid:id,type:'cube',origin:[0,0,0],box_uv:false,autouv:0,faces:Object.fromEntries(['north','south','east','west','up','down'].map(side=>[side,e.faces[side]?{uv:e.faces[side].uv.map((v,i)=>v*(i%2?20:62.5)),texture:e.faces[side].texture==='#1'?1:0}:{uv:[0,0,0,0],texture:null}]))});ids.push(id);}groups.push({name,uuid:g,origin:[0,0,0],rotation:[0,0,0],visibility:true,export:true});outliner.push({uuid:g,children:ids});}
 const textures=[mainPNG,inkPNG].map((b,i)=>({name:style+(i?'-ink':'')+'.png',uuid:randomUUID(),id:String(i),width:1000,height:320,uv_width:1000,uv_height:320,render_mode:'default',render_sides:'front',source:'data:image/png;base64,'+b.toString('base64')}));const bb={meta:{format_version:'5.0',model_format:'minecraft_title',box_uv:false},name:'transparent-foreground-'+style,resolution:{width:1000,height:320},elements,groups,outliner,textures};fs.writeFileSync(path.join(review,'blockbench',style+'.bbmodel'),JSON.stringify(bb));}
for(const[f,h]of inputs)assert.equal(hash(f),h);
const report={review,modelsChecked:records.length,materialPresetsChecked:16,frontBackPixelsVerified:verifiedPixels,minCubes:Math.min(...records.map(r=>r.newCubes)),maxCubes:Math.max(...records.map(r=>r.newCubes)),allFrontMasksPreserved:true,opaqueForegroundOverlaps:0,foregroundOffset:.01,sourceFilesUnchanged:true,pluginIntegrated:false,guiVerified:false,requires:'Separate transparent ink texture and per-face texture assignment; current compiler/plugin does not preserve this automatically.',limits:['Depth offset requires real angle and export testing.','No new per-glyph shadows are generated.'],records:records.map(({model,...r})=>r)};fs.writeFileSync(path.join(review,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'backups/block-transparent-foreground-research-last.txt'),review);console.log(JSON.stringify({review,modelsChecked:report.modelsChecked,minCubes:report.minCubes,maxCubes:report.maxCubes,sourceFilesUnchanged:true}));
