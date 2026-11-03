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


const review=fs.mkdtempSync(path.join(root,'backups/block-full-template-test-'));
for(const sub of ['textures','blockbench','gallery'])fs.mkdirSync(path.join(review,sub));
const names=fs.readdirSync(path.join(font,'characters')).filter(n=>n.endsWith('.json')).map(n=>n.slice(0,-5)).sort((a,b)=>a.localeCompare(b,'vi'));
const models=names.map(n=>read(font,n)),bottom=-12,top=88,H=100;
const records=models.map((m,i)=>{const [[a,c],[lo,hi]]=bounds(m);return{name:names[i],source:m,a,c,width:c-a,lo,hi,ink:white(m),cubes:m.elements.length};});
for(const r of records){assert.ok(r.width<=48&&r.lo>=bottom&&r.hi<=top);assert.ok(r.width>0);}
const files=fs.readdirSync(path.join(font,'textures')).filter(n=>n.endsWith('.png'));
const styles=files.filter(n=>n!=='overlay.png').map(n=>n.slice(0,-4));
const pages=[];let page={plans:[],cursor:0,row:0};
for(const r of records){if(page.cursor+r.width>1000){page.row++;page.cursor=0;}if(page.row===2){pages.push(page);page={plans:[],cursor:0,row:0};}page.plans.push({...r,tx:page.cursor,ty:page.row*132});page.cursor+=r.width;}pages.push(page);
function buildModel(r){const {a,c,tx,ty}=r,W=r.width,f=u=>({uv:u,texture:'#0'});return{texture_size:[1000,320],elements:[{name:r.name,from:[a,bottom,0],to:[c,top,16],faces:{north:f(px(tx,ty+16,tx+W,ty+116)),south:f(px(tx+W,ty+16,tx,ty+116)),up:f(px(tx+W,ty+16,tx,ty)),down:f(px(tx+W,ty+132,tx,ty+116))}}]};}
function oldFront(r,image){const out=Buffer.alloc(r.width*H*4);for(const e of r.source.elements){if(!e.faces.north)continue;const x0=Math.min(e.from[0],e.to[0]),x1=Math.max(e.from[0],e.to[0]),y0=Math.min(e.from[1],e.to[1]),y1=Math.max(e.from[1],e.to[1]);for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const c=pixel(...uv(e,'north',[x+.5,y+.5,8]),image);if(c[3])out.set(c,((top-y-1)*r.width+r.c-x-1)*4);}}return out;}
const audit=[],frameAvailability=[],galleryNames=[];
for(const style of styles){
 const image=await decode(path.join(font,'textures',style+'.png')),native=await decode(path.join(original,'textures',style+'.png')),p=profile(native,style);
 const template=Buffer.alloc(48*132*4);let opaque=0;for(let y=0;y<132;y++)for(let x=0;x<48;x++){const c=rgba(image,575+x,164+y);if(c[3]===255)opaque++;}
 // Flat uses the authored frame. Other material frames do not yet exist in source.
 for(let y=0;y<132;y++)for(let x=0;x<48;x++){const c=style==='flat'?rgba(flat,575+x,164+y):y<16?p.caps.up[y]:y>=116?p.caps.down[y-116]:surfaceColor(p,style,()=>false,x,y-16,H);template.set(c,(y*48+x)*4);}
 const tc=(x,y)=>[...template.subarray((y*48+x)*4,(y*48+x)*4+4)];
 frameAvailability.push({style,opaquePixelsInSourceFrame:opaque,total:6336,frameUsed:style==='flat'?'authored-flat':'experimental-reconstruction',sourceFrameReady:opaque===6336});
 await sharp(template,{raw:{width:48,height:132,channels:4}}).png().toFile(path.join(review,'textures','frame-'+style+'.png'));
 const tiles=[],tileW=208,tileH=232,cols=8;let index=0;
 for(const [pageIndex,page]of pages.entries()){
 const out=Buffer.alloc(1000*320*4),plans=[];
 for(const r of page.plans){const model=buildModel(r),W=r.width,mask=(x,y)=>x>=0&&x<W&&y>=0&&y<H&&r.ink.has((r.c-x-1)+','+(top-y-1));
 const color=(x,y)=>mask(x,y)||(p.shadowOffset&&mask(x-p.shadowOffset[0],y-p.shadowOffset[1]))?surfaceColor(p,style,mask,x,y,H):tc(x%48,16+y);
 const front=Buffer.alloc(W*H*4);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const c=color(x,y);put(out,r.tx+x,r.ty+16+y,c);front.set(c,(y*W+x)*4);}
 for(let y=0;y<16;y++)for(let x=0;x<W;x++){put(out,r.tx+x,r.ty+y,tc(x%48,y));put(out,r.tx+x,r.ty+116+y,tc(x%48,116+y));}
 if(style==='flat')assert.deepEqual(white(model,out),r.ink,r.name+' Flat mask');
 let samples=0;for(const side of ['north','south'])for(let y=bottom;y<top;y++)for(let x=r.a;x<r.c;x++){assert.deepEqual([...pixel(...uv(model.elements[0],side,[x+.5,y+.5,8]),out)],color(r.c-x-1,top-y-1));samples++;}
 // Verify caps by reading actual model UV, in addition to front/back.
 for(const side of ['up','down'])for(let x=r.a;x<r.c;x++)for(let z=0;z<16;z++){const actual=pixel(...uv(model.elements[0],side,[x+.5,side==='up'?top:bottom,z+.5]),out);assert.equal(actual[3],255,r.name+' cap alpha');}
 const old=oldFront(r,image);let changed=0,inside=0;
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const k=(y*W+x)*4;if(old[k+3]){inside++;if(!old.subarray(k,k+4).equals(front.subarray(k,k+4)))changed++;}}
 audit.push({style,name:r.name,page:pageIndex+1,width:W,originalBounds:[r.lo,r.hi],originalCubes:r.cubes,testCubes:1,whitePixels:r.ink.size,UVSamples:samples,flatMaskUnchanged:style==='flat'?true:undefined,changedExistingFrontPixels:changed,existingFrontPixels:inside});
 const tileX=(index%cols)*tileW,tileY=Math.floor(index/cols)*tileH;
 for(const [v,buf]of [[0,old],[1,front]])tiles.push({input:await sharp(buf,{raw:{width:W,height:H,channels:4}}).resize(W*2,H*2,{kernel:'nearest'}).png().toBuffer(),left:tileX+v*100+4,top:tileY+28});
 const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
 tiles.push({input:Buffer.from(`<svg width="208" height="28"><g fill="white" font-family="Arial" font-size="11"><text x="4" y="12">${esc(r.name)}</text><text x="4" y="25">CURRENT</text><text x="104" y="25">TEST</text></g></svg>`),left:tileX,top:tileY});index++;
 plans.push({...r,model});
 }
 const stem=style+'-page-'+(pageIndex+1),textureFile=path.join(review,'textures',stem+'.png');await sharp(out,{raw:{width:1000,height:320,channels:4}}).png().toFile(textureFile);
 const elements=[],groups=[],outliner=[];let cursor=0,row=0;
 for(const r of plans){if(cursor+r.width>480){cursor=0;row++;}const e=structuredClone(r.model.elements[0]),id=randomUUID(),g=randomUUID(),dx=cursor-e.from[0],dy=-row*120;cursor+=r.width+4;for(const k of ['from','to']){e[k][0]+=dx;e[k][1]+=dy;}
 elements.push({...e,type:'cube',uuid:id,box_uv:false,autouv:0,origin:[0,0,0],faces:Object.fromEntries(['north','south','east','west','up','down'].map(side=>[side,e.faces[side]?{uv:e.faces[side].uv.map((v,i)=>v*(i%2?20:62.5)),texture:0}:{uv:[0,0,0,0],texture:null}]))});groups.push({name:r.name,uuid:g,origin:[0,0,0],rotation:[0,0,0],export:true,visibility:true});outliner.push({uuid:g,children:[id],isOpen:true});}
 const bb={meta:{format_version:'5.0',model_format:'minecraft_title',box_uv:false},name:stem,resolution:{width:1000,height:320},elements,groups,outliner,textures:[{name:stem+'.png',uuid:randomUUID(),id:'0',width:1000,height:320,uv_width:1000,uv_height:320,render_mode:'default',render_sides:'front',visible:true,saved:false,source:'data:image/png;base64,'+fs.readFileSync(textureFile).toString('base64')}]};
 fs.writeFileSync(path.join(review,'blockbench',stem+'.bbmodel'),JSON.stringify(bb));
 }
 const gallery=style+'.png';await sharp({create:{width:cols*tileW,height:Math.ceil(records.length/cols)*tileH,channels:4,background:'#25272c'}}).composite(tiles).png().toFile(path.join(review,'gallery',gallery));galleryNames.push(gallery);
 console.log(JSON.stringify({style,glyphs:records.length,pages:pages.length,sourceFrameOpaque:opaque}));
}
// Overlay is a mask, not a material preset: audit dimensions, alpha, and correspondence separately.
const overlay=await decode(path.join(font,'textures/overlay.png'));let whiteCount=0,covered=0,extra=0;for(let k=0;k<flat.length;k+=4){const white=flat[k]===255&&flat[k+1]===255&&flat[k+2]===255&&flat[k+3]===255;if(white)whiteCount++;if(white&&overlay[k+3])covered++;if(!white&&overlay[k+3])extra++;}
for(const[f,h]of inputs)assert.equal(hash(f),h,'Protected input changed '+f);
let bbCount=0;for(const n of fs.readdirSync(path.join(review,'blockbench'))){const b=JSON.parse(fs.readFileSync(path.join(review,'blockbench',n)));assert.equal(b.elements.length,b.groups.length);const md=await sharp(Buffer.from(b.textures[0].source.split(',')[1],'base64')).metadata();assert.equal(md.width,1000);assert.equal(md.height,320);bbCount++;}
const summary={review,characters:records.length,materialPresets:styles.length,combinations:audit.length,pagesPerStyle:pages.length,bbmodels:bbCount,allCharactersFit48x100:true,maxWidth:Math.max(...records.map(r=>r.width)),sourceYBounds:[Math.min(...records.map(r=>r.lo)),Math.max(...records.map(r=>r.hi))],sourceFrame:[575,164,48,132],frameAvailability,overlay:{whiteCount,covered,extra},protectedFiles:inputs.size,sourceFilesUnchanged:true,flatMaskVerifiedForAll:true,frontBackAndCapUVVerified:true,guiVerified:false,pluginIntegrated:false,important:'Non-Flat test frames are reconstructed prototypes; changedExistingFrontPixels records artwork drift, not a pass/fail visual acceptance. Current vs Test comparison uses all actual current texture files. Full font requires multiple output pages; one 1000x320 atlas is not claimed to hold every baked glyph.'};
fs.writeFileSync(path.join(review,'report.json'),JSON.stringify(summary,null,2));fs.writeFileSync(path.join(review,'per-character-audit.json'),JSON.stringify(audit,null,2));
const html=`<!doctype html><meta charset="utf-8"><title>Block full template test</title><style>body{background:#202228;color:#eee;font:16px Arial;margin:24px}select{font:inherit;padding:8px}img{max-width:100%;image-rendering:pixelated}a{color:#9cf}</style><h1>Current / Test: 161 models</h1><p>Each tile: CURRENT left, TEST right. Fixed 100px test frame. Non-Flat material frames are experimental reconstructions. Source files unchanged; not plugin or GUI validation.</p><select id="style">${styles.map(n=>`<option>${n}</option>`).join('')}</select><p><a id="bb" href="blockbench/${styles[0]}-page-1.bbmodel">Blockbench page 1</a> — ${pages.length} pages per material</p><img id="sheet" src="gallery/${styles[0]}.png"><script>style.onchange=()=>{sheet.src='gallery/'+style.value+'.png';bb.href='blockbench/'+style.value+'-page-1.bbmodel'}</script>`;
fs.writeFileSync(path.join(review,'index.html'),html);fs.writeFileSync(path.join(root,'backups/block-full-template-test-last.txt'),review);console.log(JSON.stringify(summary,null,2));
