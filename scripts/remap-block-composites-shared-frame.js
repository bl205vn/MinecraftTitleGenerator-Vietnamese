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
const apply=process.argv.includes('--apply');assert.ok(process.argv.slice(2).every(a=>a==='--apply'));
const hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex'),inputs=new Map();
for(const base of [font,original])for(const sub of ['characters','textures','overlays'])if(fs.existsSync(path.join(base,sub)))for(const n of fs.readdirSync(path.join(base,sub))){const f=path.join(base,sub,n);if(fs.statSync(f).isFile())inputs.set(f,hash(f));}
const read=(base,n)=>JSON.parse(fs.readFileSync(path.join(base,'characters',n+'.json')));
const decode=async f=>{const r=await sharp(f).ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.deepEqual([r.info.width,r.info.height],[1000,320]);return r.data;};
const flat=await decode(path.join(font,'textures/flat.png')),nativeFlat=await decode(path.join(original,'textures/flat.png'));
const px=(a,b,c,d)=>[a/62.5,b/20,c/62.5,d/20],rgba=(data,x,y)=>[...data.subarray((y*1000+x)*4,(y*1000+x)*4+4)],put=(data,x,y,c)=>data.set(c,(y*1000+x)*4);
function white(model,image=flat){const out=new Set();for(const e of model.elements)if(e.faces.north)for(let y=e.from[1];y<e.to[1];y++)for(let x=e.from[0];x<e.to[0];x++){const c=pixel(...uv(e,'north',[x+.5,y+.5,8]),image);if(c[3]===255&&c[0]===255&&c[1]===255&&c[2]===255)out.add(x+','+y);}return out;}
function bounds(model){return[0,1,2].map(i=>[Math.min(...model.elements.flatMap(e=>[e.from[i],e.to[i]])),Math.max(...model.elements.flatMap(e=>[e.from[i],e.to[i]]))]);}

const names=fs.readdirSync(path.join(font,'characters')).filter(n=>n.endsWith('.json')).map(n=>n.slice(0,-5)).filter(n=>n.startsWith('creeper_')||([...n].length===1&&n.normalize('NFD').length>1&&'aeiouy'.includes(n.normalize('NFD')[0])&&!['ơ','ư'].includes(n)));
assert.equal(names.length,81);
const review=fs.mkdtempSync(path.join(root,'backups/block-shared-uv-models-'));for(const sub of ['before','candidate','gallery','blockbench'])fs.mkdirSync(path.join(review,sub));
const plans=[];
function rects(grid,W,H,vertical){const used=new Set(),out=[];const coords=[];for(let v=0;v<(vertical?W:H);v++)for(let u=0;u<(vertical?H:W);u++)coords.push(vertical?[v,u]:[u,v]);
 for(const[x,y]of coords){const k=y*W+x;if(used.has(k))continue;const key=grid[k];let w=1,h=1;
 if(!vertical){while(x+w<W&&!used.has(y*W+x+w)&&grid[y*W+x+w]===key)w++;while(y+h<H&&Array.from({length:w},(_,i)=>!used.has((y+h)*W+x+i)&&grid[(y+h)*W+x+i]===key).every(Boolean))h++;}
 else{while(y+h<H&&!used.has((y+h)*W+x)&&grid[(y+h)*W+x]===key)h++;while(x+w<W&&Array.from({length:h},(_,i)=>!used.has((y+i)*W+x+w)&&grid[(y+i)*W+x+w]===key).every(Boolean))w++;}
 for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++)used.add(j*W+i);out.push({x,y,w,h,key});}
 return out;
}
for(const name of names){const source=read(font,name),[[a,c],[b,d],[z,Z]]=bounds(source),W=c-a,H=d-b;
 assert.ok([a,b,c,d].every(Number.isInteger)&&W<=48&&b>=-12&&d<=88);assert.deepEqual([z,Z],[0,16]);
 const grid=Array(W*H).fill('B');let ink=0;
 for(const e of source.elements){if(!e.faces.north)continue;for(let y=e.from[1];y<e.to[1];y++)for(let x=e.from[0];x<e.to[0];x++){const[u,v]=uv(e,'north',[x+.5,y+.5,8]),sx=Math.floor(u*62.5+1e-8),sy=Math.floor(v*20+1e-8),color=rgba(flat,sx,sy);if(color[0]===255&&color[1]===255&&color[2]===255&&color[3]===255)grid[(y-b)*W+x-a]='I,'+(sx+x)+','+(sy+y);}}
 const candidates=[rects(grid,W,H,false),rects(grid,W,H,true)],pieces=candidates.sort((a,b)=>a.length-b.length)[0];
 const fx=575+Math.floor((48-W)/2),elements=pieces.map((r,i)=>{const x0=a+r.x,x1=x0+r.w,y0=b+r.y,y1=y0+r.h;let sx,sy;
 if(r.key==='B'){sx=fx+(c-x1);sy=180+(88-y1);}else{const[,ox,oy]=r.key.split(',').map((v,i)=>i?Number(v):v);sx=ox-x1+1;sy=oy-y1+1;ink+=r.w*r.h;}
 const f=u=>({uv:u,texture:'#0'}),faces={north:f(px(sx,sy,sx+r.w,sy+r.h)),south:f(px(sx+r.w,sy,sx,sy+r.h))};
 if(y1===d)faces.up=f(px(fx+c-x0,180,fx+c-x1,164));
 if(y0===b)faces.down=f(px(fx+c-x0,296,fx+c-x1,280));
 return{name:(r.key==='B'?'shared_background_':'glyph_')+(i+1),from:[x0,y0,0],to:[x1,y1,16],faces};});
 const model={...structuredClone(source),textures:{'0':'minecraft-five-bold-block-vietnamese:flat'},elements};
 assert.deepEqual(bounds(model),bounds(source));assert.deepEqual(white(model),white(source));
 const coverage=new Uint8Array(W*H);for(const e of elements)for(let y=e.from[1];y<e.to[1];y++)for(let x=e.from[0];x<e.to[0];x++)coverage[(y-b)*W+x-a]++;assert.ok(coverage.every(n=>n===1),'Coverage '+name);
 for(const side of ['north','south'])for(const e of elements)for(let y=e.from[1];y<e.to[1];y++)for(let x=e.from[0];x<e.to[0];x++)assert.equal(pixel(...uv(e,side,[x+.5,y+.5,8]),flat)[3],255);
 fs.copyFileSync(path.join(font,'characters',name+'.json'),path.join(review,'before',name+'.json'));
 fs.writeFileSync(path.join(review,'candidate',name+'.json'),JSON.stringify(model,null,2)+'\n');
 plans.push({name,source,model,oldCubes:source.elements.length,newCubes:elements.length,backgroundCubes:pieces.filter(r=>r.key==='B').length,inkPixels:ink,bounds:[a,b,c,d]});
}
// Read all models against every actual texture. Do not reconstruct or repaint textures.
const styles=fs.readdirSync(path.join(font,'textures')).filter(n=>n.endsWith('.png')&&n!=='overlay.png').map(n=>n.slice(0,-4)),audit=[];
const indexByName=new Map(plans.map(p=>[p.name,p])),allNames=fs.readdirSync(path.join(font,'characters')).filter(n=>n.endsWith('.json')).map(n=>n.slice(0,-5));
for(const style of styles){const image=await decode(path.join(font,'textures',style+'.png'));let missingModels=0,missingPixels=0;
 for(const name of allNames){const plan=indexByName.get(name),model=plan?.model??read(font,name);let missing=0,frontPixels=0;
 for(const e of model.elements)for(const side of Object.keys(e.faces)){const axis=side==='up'||side==='down'?1:2;if(axis===2)for(let y=e.from[1];y<e.to[1];y++)for(let x=e.from[0];x<e.to[0];x++){frontPixels++;if(!pixel(...uv(e,side,[x+.5,y+.5,8]),image)[3])missing++;}
 else for(let x=e.from[0];x<e.to[0];x++)for(let z=0;z<16;z++)if(!pixel(...uv(e,side,[x+.5,side==='up'?e.to[1]:e.from[1],z+.5]),image)[3])missing++;}
 if(missing){missingModels++;missingPixels+=missing;}audit.push({style,name,edited:!!plan,missingFaceSamples:missing,frontSamples:frontPixels,opaque:missing===0});}
 console.log(JSON.stringify({style,missingModels,missingSamples:missingPixels}));
}
const selected=['á','ẳ','ặ','ự','creeper_breve_hookabove'],layers=[];
for(const [j,style]of ['flat','acacia_planks','live','neon'].entries()){const image=await decode(path.join(font,'textures',style+'.png'));for(const[i,name]of selected.entries()){const p=indexByName.get(name);layers.push({input:await render(p.model,[.25,-.4,1],160,image),left:i*160,top:j*190+25});}}
await sharp({create:{width:800,height:785,channels:4,background:'#202228'}}).composite(layers).png().toFile(path.join(review,'actual-texture-preview.png'));
// Blockbench inspection sheets with actual, unchanged embedded textures.
for(const style of ['flat','acacia_planks','live','neon']){const elements=[],groups=[],outliner=[];for(const[i,p]of plans.entries()){const gid=randomUUID(),ids=[],dx=(i%10)*56,dy=-Math.floor(i/10)*110;for(const sourceElement of p.model.elements){const e=structuredClone(sourceElement),id=randomUUID();for(const k of ['from','to']){e[k][0]+=dx;e[k][1]+=dy;}elements.push({...e,uuid:id,type:'cube',origin:[0,0,0],box_uv:false,autouv:0,faces:Object.fromEntries(['north','south','east','west','up','down'].map(side=>[side,e.faces[side]?{uv:e.faces[side].uv.map((v,i)=>v*(i%2?20:62.5)),texture:0}:{uv:[0,0,0,0],texture:null}]))});ids.push(id);}groups.push({name:p.name,uuid:gid,origin:[0,0,0],rotation:[0,0,0],visibility:true,export:true});outliner.push({uuid:gid,children:ids});}
 const bb={meta:{format_version:'5.0',model_format:'minecraft_title',box_uv:false},name:'actual-shared-UV-'+style,resolution:{width:1000,height:320},elements,groups,outliner,textures:[{uuid:randomUUID(),id:'0',name:style+'.png',width:1000,height:320,uv_width:1000,uv_height:320,render_mode:'default',render_sides:'front',source:'data:image/png;base64,'+fs.readFileSync(path.join(font,'textures',style+'.png')).toString('base64')}]};fs.writeFileSync(path.join(review,'blockbench',style+'.bbmodel'),JSON.stringify(bb));}
for(const[f,h]of inputs)assert.equal(hash(f),h,'Unexpected input change '+f);
if(apply)for(const p of plans)fs.copyFileSync(path.join(review,'candidate',p.name+'.json'),path.join(font,'characters',p.name+'.json'));
for(const[f,h]of inputs)if(!plans.some(p=>f===path.join(font,'characters',p.name+'.json')))assert.equal(hash(f),h);
for(const p of plans)if(apply)assert.deepEqual(JSON.parse(fs.readFileSync(path.join(font,'characters',p.name+'.json'))),p.model);
const summary={review,applied:apply,editedComposedModels:plans.length,unchangedOtherModels:allNames.length-plans.length,texturesUnchanged:true,pluginUnchanged:true,geometryAndFlatMaskPreserved:true,disjointSolidPanelCoverage:true,minCubes:Math.min(...plans.map(p=>p.newCubes)),maxCubes:Math.max(...plans.map(p=>p.newCubes)),cubeCounts:plans.map(({name,oldCubes,newCubes})=>({name,oldCubes,newCubes})),compatibility:styles.map(style=>{const rows=audit.filter(a=>a.style===style);return{style,total:rows.length,opaqueModels:rows.filter(r=>r.opaque).length,modelsWithMissingFaces:rows.filter(r=>!r.opaque).length};}),guiVerified:false,notes:['Actual source textures were used for this check; missing background is not substituted.','No new per-character texture cells and no runtime texture baking.','Models are partitioned into disjoint glyph and background rectangles. Shared background UVs align in the new source frame.','Missing source material frames must be populated before those presets can display these models fully.','Opacity checks do not certify artistic continuity, edge shadows, or Blockbench rendering.']};
fs.writeFileSync(path.join(review,'report.json'),JSON.stringify(summary,null,2));fs.writeFileSync(path.join(review,'texture-audit.json'),JSON.stringify(audit,null,2));fs.writeFileSync(path.join(root,'backups/block-shared-uv-models-last.txt'),review);console.log(JSON.stringify(summary,null,2));
