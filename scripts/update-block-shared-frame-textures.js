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


const review=fs.mkdtempSync(path.join(root,'backups/block-material-shared-frame-'));for(const sub of ['before','candidate','gallery','blockbench'])fs.mkdirSync(path.join(review,sub));
fs.writeFileSync(path.join(review,'input-hashes.json'),JSON.stringify(Object.fromEntries(inputs),null,2));
const materialFiles=fs.readdirSync(path.join(font,'textures')).filter(n=>n.endsWith('.png')&&!['flat.png','overlay.png'].includes(n));assert.equal(materialFiles.length,15);
const outputs=new Map([['flat',flat]]),reports=[];
const inFrame=(x,y)=>x>=575&&x<623&&y>=164&&y<296;
for(const file of materialFiles){const style=file.slice(0,-4),before=await decode(path.join(font,'textures',file)),native=await decode(path.join(original,'textures',file)),p=profile(native,style),out=Buffer.from(before);
 for(let y=0;y<132;y++)for(let x=0;x<48;x++){
  // Anchor plank phase to the native letter baseline; keep bevels only at frame edges.
  const j=y-16,row=((j-38)%p.period+p.period)%p.period;
  const c=y<16?p.caps.up[y]:y>=116?p.caps.down[y-116]:style.endsWith('_planks')?p.background[row]:surfaceColor(p,style,()=>false,x,j,100);
  put(out,575+x,164+y,c);
 }
 let changed=0;for(let y=0;y<320;y++)for(let x=0;x<1000;x++){const k=(y*1000+x)*4;if(!out.subarray(k,k+4).equals(before.subarray(k,k+4))){assert.ok(inFrame(x,y));changed++;}assert.equal(out[k+3],x<8&&y>=246&&y<254?native[k+3]:flat[k+3],file+' alpha mismatch '+x+','+y);}
 assert.equal(changed,6336);const dest=path.join(review,'candidate',file);await sharp(out,{raw:{width:1000,height:320,channels:4}}).png().toFile(dest);fs.copyFileSync(path.join(font,'textures',file),path.join(review,'before',file));outputs.set(style,out);reports.push({style,changedPixels:changed,onlyFrameChanged:true,alphaMatchesFlatExceptNativeBorder:true,plankPhaseAnchored:style.endsWith('_planks')});console.log(style+': frame verified');
}
const names=fs.readdirSync(path.join(font,'characters')).filter(n=>n.endsWith('.json')).map(n=>n.slice(0,-5)).sort((a,b)=>a.localeCompare(b,'vi')),models=new Map(names.map(n=>[n,read(font,n)])),audit=[];
for(const [style,image]of outputs){const tiles=[],TW=104,TH=128,cols=12;let samples=0;
 for(const[i,name]of names.entries()){const model=models.get(name),[[a,c],[b,d]]=bounds(model),W=c-a,H=d-b,front=Buffer.alloc(W*H*4);let count=0;
  for(const e of model.elements)for(const side of Object.keys(e.faces)){
   if(side==='north'||side==='south')for(let y=e.from[1];y<e.to[1];y++)for(let x=e.from[0];x<e.to[0];x++){const color=pixel(...uv(e,side,[x+.5,y+.5,8]),image);assert.equal(color[3],255,style+'/'+name+'/'+side+' missing pixel');count++;if(side==='north')front.set(color,((d-y-1)*W+c-x-1)*4);}
   else if(side==='up'||side==='down')for(let x=e.from[0];x<e.to[0];x++)for(let z=0;z<16;z++){assert.equal(pixel(...uv(e,side,[x+.5,side==='up'?e.to[1]:e.from[1],z+.5]),image)[3],255);count++;}
  }
  samples+=count;audit.push({style,name,opaqueFaceSamples:count,missingSamples:0});
  const scale=H<=100?1:0.5,w=Math.round(W*scale),h=Math.round(H*scale),x=i%cols*TW,y=Math.floor(i/cols)*TH;
  tiles.push({input:await sharp(front,{raw:{width:W,height:H,channels:4}}).resize(w,h,{kernel:'nearest'}).png().toBuffer(),left:x+Math.floor((TW-w)/2),top:y+23});
  const esc=name.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');tiles.push({input:Buffer.from(`<svg width="104" height="22"><text x="3" y="14" fill="white" font-family="Arial" font-size="10">${esc}</text></svg>`),left:x,top:y});
 }
 await sharp({create:{width:cols*TW,height:Math.ceil(names.length/cols)*TH,channels:4,background:'#25272c'}}).composite(tiles).png().toFile(path.join(review,'gallery',style+'.png'));console.log(style+': '+names.length+' models; '+samples+' face samples verified');
}
const selected=['á','ẳ','ặ','ự','creeper_breve_hookabove'],show=['flat','acacia_planks','live','neon','bedrock_button'],layers=[];
for(const[j,style]of show.entries())for(const[i,name]of selected.entries())layers.push({input:await render(models.get(name),[.25,-.4,1],160,outputs.get(style)),left:i*160,top:j*190+25});
const labels=Buffer.from(`<svg width="800" height="975"><g fill="white" font-family="Arial" font-size="14">${show.map((s,i)=>`<text x="6" y="${i*190+18}">${s}</text>`).join('')}</g></svg>`);layers.push({input:labels,left:0,top:0});
await sharp({create:{width:800,height:975,channels:4,background:'#202228'}}).composite(layers).png().toFile(path.join(review,'preview.png'));
// Separate top/bottom oblique samples, using real current model UVs.
const angles=[];for(const[j,dir]of [[.3,-.8,1],[.3,.8,1]].entries())for(const[i,name]of selected.entries())angles.push({input:await render(models.get(name),dir,160,outputs.get('acacia_planks')),left:i*160,top:j*170});
await sharp({create:{width:800,height:340,channels:4,background:'#202228'}}).composite(angles).png().toFile(path.join(review,'oblique-up-down.png'));
const previous=fs.readFileSync(path.join(root,'backups/block-shared-uv-models-last.txt'),'utf8');for(const style of ['flat','acacia_planks','live','neon']){const bb=JSON.parse(fs.readFileSync(path.join(previous,'blockbench',style+'.bbmodel')));const png=await sharp(outputs.get(style),{raw:{width:1000,height:320,channels:4}}).png().toBuffer();bb.textures[0].source='data:image/png;base64,'+png.toString('base64');fs.writeFileSync(path.join(review,'blockbench',style+'.bbmodel'),JSON.stringify(bb));}
for(const[f,h]of inputs)assert.equal(hash(f),h,'Source changed while preparing '+f);
if(apply)for(const file of materialFiles){fs.copyFileSync(path.join(review,'candidate',file),path.join(font,'textures',file));assert.deepEqual(await decode(path.join(font,'textures',file)),outputs.get(file.slice(0,-4)));}
for(const[f,h]of inputs)if(!materialFiles.some(n=>f===path.join(font,'textures',n)))assert.equal(hash(f),h,'Protected file changed '+f);
const report={review,applied:apply,textureCount:15,changedRegion:[575,164,48,132],unchangedOutsideRegion:true,flatAndOverlayUnchanged:true,modelsUnchanged:true,pluginUnchanged:true,characters:names.length,materials:outputs.size,combinations:audit.length,missingFaceSamples:0,alphaMatchesFlatExceptNativeBorderForAll:true,geometryScope:'current composed models, not the baked one-cube prototypes',guiVerified:false,artLimitations:['Shared backgrounds contain no per-glyph drop shadows. Existing texture ink remains unchanged.','This verifies opaque UV coverage and source preservation; it does not certify perfect artistic continuity for every style.'],textures:reports};
fs.writeFileSync(path.join(review,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(review,'texture-audit.json'),JSON.stringify(audit,null,2));fs.writeFileSync(path.join(root,'backups/block-material-shared-frame-last.txt'),review);
fs.writeFileSync(path.join(review,'index.html'),`<!doctype html><meta charset="utf-8"><title>Actual Block textures</title><style>body{background:#25272c;color:white;font:16px Arial;padding:20px}img{max-width:100%;image-rendering:pixelated}select{font:inherit;padding:8px}</style><p>Actual current models and updated source textures. Coverage verified; artistic and Blockbench acceptance pending.</p><select id="preset">${[...outputs.keys()].map(s=>`<option>${s}</option>`).join('')}</select><p><a id="download" href="blockbench/flat.bbmodel">Open embedded Flat bbmodel</a></p><img id="gallery" src="gallery/flat.png"><script>document.getElementById('preset').onchange=function(){document.getElementById('gallery').src='gallery/'+this.value+'.png'}</script>`);
console.log(JSON.stringify(report,null,2));
