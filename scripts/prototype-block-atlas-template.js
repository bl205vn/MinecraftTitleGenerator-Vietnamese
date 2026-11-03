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
const front=n=>read(original,n).elements[0].faces.north.uv.map((v,i)=>Math.round(v*(i%2?20:62.5))),space=front('space');
function mode(values){const counts=new Map();for(const c of values){const k=c.join(',');counts.set(k,(counts.get(k)||0)+1);}assert.ok(counts.size);return[...counts].sort((a,b)=>b[1]-a[1])[0][0].split(',').map(Number);}
function profile(data,style){
 const background=Array.from({length:48},(_,j)=>rgba(data,space[0]+5,space[1]+j)),fg=Array.from({length:48},()=>[]),all=[];
 for(const n of ['a','e','o','u','^','~']){const[x,y,X]=front(n);for(let j=0;j<48;j++)for(let i=x;i<X;i++)if(nativeFlat[((y+j)*1000+i)*4]===255){const c=rgba(data,i,y+j);fg[j].push(c);all.push(c);}}
 const common=mode(all),foreground=fg.map(row=>row.length?mode(row):null);
 if(style==='neon')for(let y=0;y<48;y++){const values=[];for(let x=0;x<1000;x++){const c=rgba(data,x,16+y);if(c[3]===255&&c[1]===64&&c[0]>100&&c[2]>190)values.push(c);}if(values.length)foreground[y]=mode(values);}
 for(let y=0;y<48;y++)if(!foreground[y]){const known=foreground.map((c,i)=>c?i:-1).filter(i=>i>=0);if(style!=='neon'){foreground[y]=common;continue;}const[a,b]=y<known[0]?known.slice(0,2):known.slice(-2);foreground[y]=foreground[a].map((v,i)=>i===3?255:Math.max(0,Math.min(255,Math.round(v+(foreground[b][i]-v)*(y-a)/(b-a)))));}
 const caps={};for(const side of ['up','down']){const u=read(original,'a').elements[0].faces[side].uv.map((v,i)=>Math.round(v*(i%2?20:62.5))),x=Math.min(u[0],u[2]),y=Math.min(u[1],u[3]);caps[side]=Array.from({length:16},(_,j)=>rgba(data,x+5,y+j));}
 let period=48;for(let p=2;p<=40;p++)if(background.every((c,i)=>i<p||c.join(',')===background[i-p].join(','))){period=p;break;}
 const shadowOffset=style==='live'?[0,1]:style==='bedrock_button'?[2,2]:null;let shadow;
 if(shadowOffset){const[x,y,X]=front('a'),values=[],[dx,dy]=shadowOffset,mask=(i,j)=>i>=0&&i<X-x&&j>=0&&j<48&&nativeFlat[((y+j)*1000+x+i)*4]===255;
  for(let j=2;j<46;j++)for(let i=0;i<X-x;i++)if(!mask(i,j)&&mask(i-dx,j-dy))values.push(rgba(data,x+i,y+j));shadow=mode(values);
 }
 return{background,foreground,common,caps,period,shadowOffset,shadow};
}
function surfaceColor(p,style,mask,x,y,H){
 if(style==='flat')return mask(x,y)?[255,255,255,255]:[137,137,137,255];
 if(mask(x,y))return style==='neon'?p.foreground[Math.round(y*47/(H-1))]:p.common;
 if(p.shadowOffset&&mask(x-p.shadowOffset[0],y-p.shadowOffset[1]))return p.shadow;
 if(style.endsWith('_planks'))return p.background[y%p.period];
 if(style==='neon'){if(y===0)return p.background[0];if(y===H-1)return p.background[47];return p.background[Math.max(1,Math.min(46,Math.round(y*47/(H-1))))];}
 if(style==='live')return p.background[y===H-1?47:24];
 if(style.startsWith('bedrock_button'))return p.background[y<2?y:y>=H-2?46+y-(H-2):24];
 throw Error('Unknown material '+style);
}

const review=fs.mkdtempSync(path.join(root,'backups/block-atlas-template-'));
for(const sub of ['textures','blockbench'])fs.mkdirSync(path.join(review,sub));
const cases={plain:['a','u','o'],upper:['a','ẳ','creeper_breve_hookabove'],lower:['a','ạ','ự'],both:['a','à','ẳ','ặ','ự','creeper_breve_hookabove']};
const styles=['flat','acacia_planks','live','bedrock_button','neon'];
const cache=new Map();for(const style of styles)cache.set(style,profile(style==='flat'?nativeFlat:await decode(path.join(original,'textures',style+'.png')),style));
const allModels=fs.readdirSync(path.join(font,'characters')).filter(n=>n.endsWith('.json')).map(n=>read(font,n.slice(0,-5)));
const fullBounds=[Math.min(...allModels.map(m=>bounds(m)[1][0])),Math.max(...allModels.map(m=>bounds(m)[1][1]))];
const audit=[],previews=[];
for(const [caseName,names]of Object.entries(cases)){
 const sources=names.map(n=>read(font,n)),bottom=-12,top=88,H=top-bottom;
 let cursor=0;const plans=sources.map((source,i)=>{const [[a,c]]=bounds(source),W=c-a,x=cursor;cursor+=W;
 const f=u=>({uv:u,texture:'#0'}),model={texture_size:[1000,320],elements:[{name:names[i],from:[a,bottom,0],to:[c,top,16],faces:{north:f(px(x,16,x+W,16+H)),south:f(px(x+W,16,x,16+H)),up:f(px(x+W,16,x,0)),down:f(px(x+W,H+32,x,H+16))}}]};
 return{name:names[i],source,model,ink:white(source),a,c,W,x};});
 assert.ok(cursor<=1000&&H+32<=320);
 for(const style of styles){
 const p=cache.get(style),out=Buffer.alloc(1000*320*4);
 const template=Buffer.alloc(48*132*4);
 for(let y=0;y<132;y++)for(let x=0;x<48;x++){
  const c=style==='flat'?rgba(flat,575+x,164+y):y<16?p.caps.up[y]:y>=116?p.caps.down[y-116]:surfaceColor(p,style,()=>false,x,y-16,100);
  template.set(c,(y*48+x)*4);
 }
 if(caseName==='both')await sharp(template,{raw:{width:48,height:132,channels:4}}).png().toFile(path.join(review,'textures','template-'+style+'.png'));
 const tc=(x,y)=>[...template.subarray((y*48+x)*4,(y*48+x)*4+4)];
 const color=(mask,x,y)=>{if(mask(x,y)||(p.shadowOffset&&mask(x-p.shadowOffset[0],y-p.shadowOffset[1])))return surfaceColor(p,style,mask,x,y,H);return tc(x%48,16+y);};

 for(const plan of plans){const{a,c,W,x:tx,ink,model}=plan,mask=(x,y)=>x>=0&&x<W&&y>=0&&y<H&&ink.has((c-x-1)+','+(top-y-1));
  for(let y=0;y<H;y++)for(let x=0;x<W;x++)put(out,tx+x,16+y,color(mask,x,y));
  for(let y=0;y<16;y++)for(let x=0;x<W;x++){put(out,tx+x,y,tc(x%48,y));put(out,tx+x,H+16+y,tc(x%48,116+y));}
  if(style==='flat')assert.deepEqual(white(model,out),ink,caseName+'/'+plan.name+' mask changed');
  for(const side of ['north','south'])for(let y=bottom;y<top;y++)for(let x=a;x<c;x++)assert.deepEqual([...pixel(...uv(model.elements[0],side,[x+.5,y+.5,8]),out)],color(mask,c-x-1,top-y-1));
 }
 const stem=caseName+'-'+style,file=path.join(review,'textures',stem+'.png');await sharp(out,{raw:{width:1000,height:320,channels:4}}).png().toFile(file);
 const elements=[],groups=[],outliner=[];let worldX=0;
 for(const plan of plans){const e=structuredClone(plan.model.elements[0]),id=randomUUID(),g=randomUUID(),dx=worldX-e.from[0];worldX+=plan.W;for(const k of ['from','to'])e[k][0]+=dx;
 elements.push({...e,type:'cube',uuid:id,box_uv:false,autouv:0,origin:[0,0,0],faces:Object.fromEntries(['north','south','east','west','up','down'].map(side=>[side,e.faces[side]?{uv:e.faces[side].uv.map((v,i)=>v*(i%2?20:62.5)),texture:0}:{uv:[0,0,0,0],texture:null}]))});
 groups.push({name:plan.name,uuid:g,origin:[0,0,0],rotation:[0,0,0],export:true,visibility:true});outliner.push({uuid:g,children:[id],isOpen:true});
 }
 const bb={meta:{format_version:'5.0',model_format:'minecraft_title',box_uv:false},name:stem,resolution:{width:1000,height:320},elements,groups,outliner,textures:[{name:stem+'.png',uuid:randomUUID(),id:'0',width:1000,height:320,uv_width:1000,uv_height:320,render_mode:'default',render_sides:'front',visible:true,saved:false,source:'data:image/png;base64,'+fs.readFileSync(file).toString('base64')}]};
 fs.writeFileSync(path.join(review,'blockbench',stem+'.bbmodel'),JSON.stringify(bb,null,2));
 // Render the assembled row using its actual UVs; this is not a Blockbench screenshot.
 const combined={elements:elements.map(e=>({...e,faces:Object.fromEntries(Object.entries(e.faces).filter(([,f])=>f.texture!==null).map(([k,f])=>[k,{...f,uv:f.uv.map((v,i)=>v/(i%2?20:62.5))}]))}))};
 const preview=await render(combined,[.15,-.22,1],460,out);await sharp(preview).png().toFile(path.join(review,stem+'-preview.png'));
 if(caseName==='both')previews.push({input:preview,left:(styles.indexOf(style)%3)*460,top:Math.floor(styles.indexOf(style)/3)*490+30});
 audit.push({case:caseName,style,names,bounds:[bottom,top],usedOutput:[cursor,H+32],atlas:[1000,320],oneCubePerCharacter:true,frontBackUVVerified:true,maskUnchanged:style==='flat'?true:undefined});
 }
}
await sharp({create:{width:1380,height:1010,channels:4,background:'#202228'}}).composite(previews).png().toFile(path.join(review,'comparison.png'));
for(const[f,h]of inputs)assert.equal(hash(f),h,'Protected source changed '+f);
const report={review,sharedSourceFrame:[575,164,48,132],frontHeight:100,frameWorldY:[-12,88],sourceAtlas:[1000,320],outputAtlas:[1000,320],sourceFilesUnchanged:true,globalTemplateY:fullBounds,cases:audit,notes:['Fresh runtime-like output per row, not additional cells in source atlas.','Profiles are reused from the original materials; extended artwork is a prototype.','No plugin integration, no GUI verification, no automatic multi-row packing yet.'],guiVerified:false,pluginChanged:false};
fs.writeFileSync(path.join(review,'report.json'),JSON.stringify(report,null,2));
fs.writeFileSync(path.join(review,'README.txt'),'REVIEW ONLY. Open blockbench/both-acacia_planks.bbmodel or both-neon.bbmodel directly. Textures are embedded. Cases: plain, upper, lower, both. Each row has a common vertical frame and one cube per glyph. Source atlas and plugin unchanged. A fresh 1000x320 output texture is generated per row, only the used rectangle is occupied. No full-font unique-cell atlas is created. Flat background is read from the authored frame at 575,164,48x132. All cases use the maximum 100px frame for this test, not dynamic trimming. Material profiles are prototype reconstructions. GUI verification pending.');
fs.writeFileSync(path.join(root,'backups/block-atlas-template-last.txt'),review);
console.log(JSON.stringify({review,globalTemplateY:fullBounds,examples:audit.filter(a=>a.style==='flat'),protectedFiles:inputs.size,unchanged:true},null,2));

