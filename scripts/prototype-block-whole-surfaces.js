// Review-only prototype: bake a complete Block surface before assigning UVs.
// Eight example cells fit in unused space of a COPY of the 1000x320 atlas.
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
const isolatedNames=['á','ẳ','ự','creeper_breve_hookabove'],rowNames=['a','ẳ','ự','creeper_breve_hookabove'];
const allNames=[...new Set([...isolatedNames,...rowNames])],sources=new Map(allNames.map(n=>[n,read(font,n)]));
const rowBottom=Math.min(...rowNames.map(n=>bounds(sources.get(n))[1][0])),rowTop=Math.max(...rowNames.map(n=>bounds(sources.get(n))[1][1]));
const plans=[];let nextX=580;
for(const [kind,names]of [['isolated',isolatedNames],['row',rowNames]])for(const name of names){
 const source=sources.get(name),[[a,c],[lo,hi]]=bounds(source),b=kind==='row'?rowBottom:lo,d=kind==='row'?rowTop:hi,W=c-a,H=d-b,x=nextX,y=164;nextX+=W+2;
 assert.ok(x+W<=1000&&y+H+32<=320,'Prototype exceeds fixed atlas');
 for(let j=y;j<y+H+32;j++)for(let i=x;i<x+W;i++)assert.equal(flat[(j*1000+i)*4+3],0,'Prototype would overlap authored atlas');
 const face=u=>({uv:u,texture:'#0'}),model={credit:'Prototype by Ewan Howell & bl205vn',texture_size:[1000,320],textures:{'0':'prototype:flat'},elements:[{name:name+'_whole_surface',from:[a,b,0],to:[c,d,16],faces:{north:face(px(x,y+16,x+W,y+16+H)),south:face(px(x+W,y+16,x,y+16+H)),up:face(px(x+W,y+16,x,y)),down:face(px(x+W,y+32+H,x,y+16+H))}}]};
 plans.push({kind,name,source,model,ink:white(source),panel:[a,b,c,d],cell:[x,y,W,H+32],width:W,height:H});
}
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
const review=fs.mkdtempSync(path.join(root,'backups/block-whole-surface-'));for(const sub of ['textures','models','blockbench'])fs.mkdirSync(path.join(review,sub));
fs.writeFileSync(path.join(review,'input-hashes.json'),JSON.stringify(Object.fromEntries(inputs),null,2));
const styles=['flat','acacia_planks','live','bedrock_button','bedrock_button_unpressed','neon'],atlases=new Map(),audit=[];
for(const style of styles){
 const native=style==='flat'?nativeFlat:await decode(path.join(original,'textures',style+'.png')),p=profile(native,style),current=style==='flat'?flat:await decode(path.join(font,'textures',style+'.png')),out=Buffer.from(current);
 for(const plan of plans){const[a,b,c,d]=plan.panel,[tx,ty]=plan.cell,W=plan.width,H=plan.height,mask=(x,y)=>x>=0&&x<W&&y>=0&&y<H&&plan.ink.has((c-x-1)+','+(d-y-1));
  for(let y=0;y<H;y++)for(let x=0;x<W;x++)put(out,tx+x,ty+16+y,surfaceColor(p,style,mask,x,y,H));
  for(let y=0;y<16;y++)for(let x=0;x<W;x++){put(out,tx+x,ty+y,style==='flat'?[176,176,176,255]:p.caps.up[y]);put(out,tx+x,ty+16+H+y,style==='flat'?[84,84,84,255]:p.caps.down[y]);}
  const e=plan.model.elements[0];for(const side of ['north','south'])for(let y=b;y<d;y++)for(let x=a;x<c;x++){
   const actual=[...pixel(...uv(e,side,[x+.5,y+.5,8]),out)],want=surfaceColor(p,style,mask,c-x-1,d-y-1,H);assert.deepEqual(actual,want,style+'/'+plan.name+' whole-surface sample '+side);
  }
  assert.equal(plan.model.elements.length,1);
  if(style==='flat')assert.deepEqual(white(plan.model,out),plan.ink,plan.name+' changed glyph pixels');
 }
 // No source pixel outside the eight experimental cells may change.
 for(let y=0;y<320;y++)for(let x=0;x<1000;x++)if(!rgba(out,x,y).every((v,i)=>v===current[(y*1000+x)*4+i]))assert.ok(plans.some(p=>x>=p.cell[0]&&x<p.cell[0]+p.cell[2]&&y>=p.cell[1]&&y<p.cell[1]+p.cell[3]),'Outside prototype cells');
 const file=path.join(review,'textures',style+'.png');await sharp(out,{raw:{width:1000,height:320,channels:4}}).png().toFile(file);atlases.set(style,out);
 audit.push({style,atlas:[1000,320],surfaceCount:plans.length,grainPeriod:style.endsWith('_planks')?p.period:null,oneCubePerGlyph:true,frontAndBackTexelsVerified:true});
}
for(const plan of plans){const folder=path.join(review,'models',plan.kind);fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,plan.name+'.json'),JSON.stringify(plan.model,null,2)+'\n');}
// Embedded-texture BBModels can be opened directly; no build/push is needed.
function bbmodel(style,kind){const elements=[],groups=[],outliner=[];let cursor=0;const entries=plans.filter(p=>p.kind===kind);for(const p of entries){const id=randomUUID(),group=randomUUID(),e=structuredClone(p.model.elements[0]),dx=cursor-e.from[0];cursor+=p.width+(kind==='row'?0:12);for(const k of ['from','to'])e[k][0]+=dx;
 const cube={...e,type:'cube',uuid:id,box_uv:false,autouv:0,color:0,origin:[0,0,0],faces:Object.fromEntries(['north','south','east','west','up','down'].map(side=>{const f=e.faces[side];return[side,f?{uv:f.uv.map((v,i)=>v*(i%2?20:62.5)),texture:0}:{uv:[0,0,0,0],texture:null}];}))};elements.push(cube);groups.push({name:p.name,uuid:group,origin:[0,0,0],rotation:[0,0,0],export:true,visibility:true});outliner.push({uuid:group,children:[id],isOpen:true});}
 return{meta:{format_version:'5.0',model_format:'minecraft_title',box_uv:false},name:'whole_surface_'+kind+'_'+style,resolution:{width:1000,height:320},elements,groups,outliner,textures:[{name:style+'.png',uuid:randomUUID(),id:'0',width:1000,height:320,uv_width:1000,uv_height:320,render_mode:'default',render_sides:'front',visible:true,saved:false,source:'data:image/png;base64,'+fs.readFileSync(path.join(review,'textures',style+'.png')).toString('base64')}]};}
for(const style of styles)for(const kind of ['isolated','row'])fs.writeFileSync(path.join(review,'blockbench',style+'-'+kind+'.bbmodel'),JSON.stringify(bbmodel(style,kind),null,2)+'\n');
// Comparison: old mosaic / new whole surface, using actual model UVs.
const comparison=[],sz=130,showStyles=styles.filter(s=>s!=='flat');
for(const[i,name]of isolatedNames.entries())for(const[j,style]of showStyles.entries())for(const[v,m]of [[0,sources.get(name)],[1,plans.find(p=>p.kind==='isolated'&&p.name===name).model]]){
 const image=v?atlases.get(style):await decode(path.join(font,'textures',style+'.png'));comparison.push({input:await render(m,[.4,-.55,1],sz,image),left:(j*2+v)*sz,top:i*165+30});
}
const W=showStyles.length*2*sz,H=isolatedNames.length*165+30,labels=Buffer.from(`<svg width="${W}" height="${H}"><g fill="white" font-size="12" font-family="Arial">${showStyles.map((s,i)=>`<text x="${i*2*sz+4}" y="16">${s}</text><text x="${i*2*sz+4}" y="29">OLD</text><text x="${(i*2+1)*sz+4}" y="29">NEW</text>`).join('')}${isolatedNames.map((n,i)=>`<text x="4" y="${i*165+48}">${n}</text>`).join('')}</g></svg>`);comparison.push({input:labels,left:0,top:0});
await sharp({create:{width:W,height:H,channels:4,background:'#1c1e23'}}).composite(comparison).png().toFile(path.join(review,'before-after.png'));
const rowLayers=[];for(const[i,style]of showStyles.entries())for(const[j,p]of plans.filter(p=>p.kind==='row').entries())rowLayers.push({input:await render(p.model,[0,0,1],140,atlases.get(style)),left:j*140,top:i*165+24});
await sharp({create:{width:560,height:showStyles.length*165+24,channels:4,background:'#1c1e23'}}).composite(rowLayers).png().toFile(path.join(review,'uniform-row-preview.png'));
for(const[f,h]of inputs)assert.equal(hash(f),h,'Existing font/source changed '+f);
const summary={review,scope:'four review prototypes only',isolated:isolatedNames,uniformRow:rowNames,rowBounds:[rowBottom,rowTop],panels:plans.map(({name,kind,cell,panel})=>({name,kind,cell,panel})),audit,existingFontFilesUnchanged:true,pluginUnchanged:true,pluginDynamicFrameImplemented:false,guiVerified:false};
fs.writeFileSync(path.join(review,'report.json'),JSON.stringify(summary,null,2));fs.writeFileSync(path.join(root,'backups/block-whole-surface-last.txt'),review);
fs.writeFileSync(path.join(review,'READ-ME.txt'),'REVIEW ONLY\nOpen blockbench/*-isolated.bbmodel to compare four single-cube glyphs.\nOpen *-row.bbmodel for a prebuilt shared-height row (a, ẳ, ự, Creeper Ẳ).\nTextures are embedded. No compile, GitHub push, or source Flat change is required.\nThis proves whole-surface texture baking; the plugin has not been integrated.\nNative material palettes are reused; extended surfaces are newly composed.\n');
console.log(JSON.stringify({review,isolated:isolatedNames,uniformRow:rowNames,rowBounds:[rowBottom,rowTop],models:plans.length,materials:styles.length,cubesPerGlyph:1,existingFontFilesUnchanged:true,pluginUnchanged:true},null,2));
