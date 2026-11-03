// Adapt the original Block materials to the authored Vietnamese atlas.
// Flat, source artwork, models and plugin code are protected inputs.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {render} from './five-offline-render.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),original=path.join(root,'fonts/minecraft-five-bold-block'),target=path.join(root,'fonts/minecraft-five-bold-block-vietnamese');
const apply=process.argv.includes('--apply');assert.ok(process.argv.slice(2).every(a=>a==='--apply'));
const read=(base,n)=>JSON.parse(fs.readFileSync(path.join(base,'characters',n+'.json')));
const hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex'),inputs=new Map();
for(const base of [original,target])for(const sub of ['characters','textures','overlays'])if(fs.existsSync(path.join(base,sub)))for(const n of fs.readdirSync(path.join(base,sub))){const f=path.join(base,sub,n);if(fs.statSync(f).isFile())inputs.set(f,hash(f));}
const metadataFile=path.join(target,'textures.json');inputs.set(metadataFile,hash(metadataFile));
const decode=async f=>{const r=await sharp(f).ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.deepEqual([r.info.width,r.info.height],[1000,320]);return r.data;};
const oldFlat=await decode(path.join(original,'textures/flat.png')),flat=await decode(path.join(target,'textures/flat.png'));
const rgba=(data,x,y)=>[...data.subarray((y*1000+x)*4,(y*1000+x)*4+4)],set=(data,x,y,c)=>data.set(c,(y*1000+x)*4);
const front=n=>read(original,n).elements[0].faces.north.uv.map((v,i)=>Math.round(v*(i%2?20:62.5)));
const space=front('space'),sampleNames=['a','e','o','u','^','~'];
function mode(colors){const count=new Map();for(const c of colors){const k=c.join(',');count.set(k,(count.get(k)||0)+1);}assert.ok(count.size);return[...count].sort((a,b)=>b[1]-a[1])[0][0].split(',').map(Number);}
function profiles(data,name){
 const background=Array.from({length:48},(_,y)=>rgba(data,space[0]+5,space[1]+y));
 const rows=Array.from({length:48},()=>[]),all=[];
 for(const n of sampleNames){const[x,y,X]=front(n);for(let j=0;j<48;j++)for(let i=x;i<X;i++)if(oldFlat[((y+j)*1000+i)*4]===255){const c=rgba(data,i,y+j);rows[j].push(c);all.push(c);}}
 const common=mode(all),foreground=rows.map(row=>row.length?mode(row):null);
 if(name==='neon')for(let y=0;y<48;y++){
  const bright=[];for(let x=0;x<1000;x++){const c=rgba(data,x,16+y);if(c[3]===255&&c[1]===64&&c[0]>100&&c[2]>190)bright.push(c);}
  if(bright.length)foreground[y]=mode(bright);
 }
 for(let y=0;y<48;y++)if(!foreground[y]){
  if(name!=='neon'){foreground[y]=common;continue;}
  const known=foreground.map((c,i)=>c?i:-1).filter(i=>i>=0),pair=y<known[0]?known.slice(0,2):known.slice(-2),[a,b]=pair;
  foreground[y]=foreground[a].map((v,k)=>k===3?255:Math.max(0,Math.min(255,Math.round(v+(foreground[b][k]-v)*(y-a)/(b-a)))));
 }
 const shadowOffset=name==='live'?[0,1]:name==='bedrock_button'?[2,2]:null;
 let shadow=null;if(shadowOffset){const colors=[],[dx,dy]=shadowOffset;
  for(const n of sampleNames){const[x,y,X]=front(n),w=X-x,isWhite=(i,j)=>i>=0&&i<w&&j>=0&&j<48&&oldFlat[((y+j)*1000+x+i)*4]===255;
   for(let j=2;j<46;j++)for(let i=0;i<w;i++)if(!isWhite(i,j)&&isWhite(i-dx,j-dy))colors.push(rgba(data,x+i,y+j));
  }shadow=mode(colors);
 }
 const a=read(original,'a').elements[0],caps={};for(const side of ['up','down']){const u=a.faces[side].uv.map((v,i)=>Math.round(v*(i%2?20:62.5))),x=Math.min(u[0],u[2]),y=Math.min(u[1],u[3]);caps[side]=Array.from({length:16},(_,j)=>rgba(data,x+Math.floor(Math.abs(u[2]-u[0])/2),y+j));}
 const learned=new Map(),counts=new Map();
 if(name.endsWith('_planks'))for(const filename of fs.readdirSync(path.join(original,'characters')).filter(n=>n.endsWith('.json')&&!sampleNames.includes(n.slice(0,-5)))){
  const model=read(original,filename.slice(0,-5)),u=model.elements[0]?.faces.north?.uv;if(!u)continue;const[x,y,X,Y]=u.map((v,i)=>Math.round(v*(i%2?20:62.5))),w=X-x;if(Y-y!==48)continue;
  const mask=(i,j)=>i>=0&&i<w&&j>=0&&j<48&&oldFlat[((y+j)*1000+x+i)*4]===255;
  for(let j=0;j<48;j++)for(let i=0;i<w;i++){const k=j+':'+neighborhood(mask,i,j);if(!counts.has(k))counts.set(k,[]);counts.get(k).push(rgba(data,x+i,y+j));}
 }
 for(const[k,c]of counts)learned.set(k,mode(c));
 return{background,foreground,shadowOffset,shadow,caps,learned};
}
function neighborhood(mask,x,y){let bits=0,n=0;for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++,n++)if(mask(x+i,y+j))bits|=1<<n;return bits;}
function colorFront(p,mask,x,y){const learned=p.learned.get(y+':'+neighborhood(mask,x,y));if(learned)return learned;if(mask(x,y))return p.foreground[y];if(p.shadowOffset&&mask(x-p.shadowOffset[0],y-p.shadowOffset[1]))return p.shadow;return p.background[y];}
function nativeRegression(data,p){let total=0,different=0;for(const n of sampleNames){const[x,y,X]=front(n),w=X-x,mask=(i,j)=>i>=0&&i<w&&j>=0&&j<48&&oldFlat[((y+j)*1000+x+i)*4]===255;
 for(let j=0;j<48;j++)for(let i=0;i<w;i++){total++;if(rgba(data,x+i,y+j).join(',')!==colorFront(p,mask,i,j).join(','))different++;}}
 // Diagnostic on held-out glyphs: authored engraving/bevel details can differ.
 // Existing artwork is copied exactly and verified separately below.
 assert.ok(different/total<0.1,'Style reconstruction differs substantially from original: '+different+'/'+total);return{total,different};}
const specs=[['đ',294,42],['ư',338,42],['ơ',382,42],['grave',426,18],['acute',446,18],['hookabove',466,24],['breve',492,30]];
const changed=(x,y)=>y>=164&&y<244&&(x>=294&&x<522||x>=524&&x<573);
const review=fs.mkdtempSync(path.join(root,'backups/block-materials-'));fs.mkdirSync(path.join(review,'candidates'));
fs.writeFileSync(path.join(review,'input-hashes.json'),JSON.stringify(Object.fromEntries(inputs),null,2));
const reports=[],outputs=new Map();
// Process and verify each material independently before proceeding to the next.
for(const file of fs.readdirSync(path.join(original,'textures')).filter(n=>n.endsWith('.png')&&!['flat.png','overlay.png'].includes(n)).sort()){
 const name=file.slice(0,-4),source=await decode(path.join(original,'textures',file)),p=profiles(source,name),regression=nativeRegression(source,p),out=Buffer.from(source);
 for(let y=164;y<244;y++)for(let x=294;x<343;x++){set(out,x+230,y,rgba(source,x,y));set(out,x,y,[0,0,0,0]);}
 for(const[n,x,w]of specs){const mask=(i,j)=>i>=0&&i<w&&j>=0&&j<48&&flat[((180+j)*1000+x+i)*4]===255;
  for(let y=0;y<80;y++)for(let i=0;i<w;i++)set(out,x+i,164+y,y<16?p.caps.up[y]:y>=64?p.caps.down[y-64]:colorFront(p,mask,i,y-16));
 }
 // Remove source-only credits/test pixels outside the target's real UV mask.
 for(let i=0;i<out.length;i+=4){const x=(i/4)%1000,y=Math.floor(i/4000);if(x<8&&y>=246&&y<254){source.copy(out,i,i,i+4);continue;}if(!flat[i+3])out.fill(0,i,i+4);else assert.equal(out[i+3],255,name+' hole at '+i/4);}
 let preserved=0,newPixels=0;for(let y=0;y<320;y++)for(let x=0;x<1000;x++){
  const at=(y*1000+x)*4;
  if(flat[at+3]&&oldFlat[at+3]&&!changed(x,y)){assert.deepEqual(out.subarray(at,at+4),source.subarray(at,at+4),name+' changed old art at '+x+','+y);preserved++;}
  if(flat[at+3]&&changed(x,y))newPixels++;
 }
 for(let y=164;y<244;y++)for(let x=524;x<573;x++)if(flat[(y*1000+x)*4+3])assert.deepEqual(rgba(out,x,y),rgba(source,x-230,y),name+' terminator move mismatch');
 const dest=path.join(review,'candidates',file);await sharp(out,{raw:{width:1000,height:320,channels:4}}).png().toFile(dest);outputs.set(file,{data:out,file:dest});
 reports.push({texture:file,nativeRegression:regression,preservedPixels:preserved,newOrRelocatedPixels:newPixels,alphaMatchesFlatExceptNativeBorder:true,newCellCount:7});console.log(name+': verified '+preserved+' original pixels; '+newPixels+' adapted pixels; native reference '+(regression.total-regression.different)+'/'+regression.total);
}
const overlay=Buffer.alloc(flat.length);let overlayPixels=0;for(let i=0;i<flat.length;i+=4)if(flat[i+3]&&flat[i]===255&&flat[i+1]===255&&flat[i+2]===255){overlay.set([255,255,255,255],i);overlayPixels++;}
const overlayFile=path.join(review,'candidates/overlay.png');await sharp(overlay,{raw:{width:1000,height:320,channels:4}}).png().toFile(overlayFile);outputs.set('overlay.png',{data:overlay,file:overlayFile});
// Build reviews with actual current composed-model UVs, not a flattened mockup.
const examples=['ả','ẳ','ự','ợ','creeper_breve_hookabove'],styles=['acacia_planks.png','neon.png','live.png','bedrock_button.png','bedrock_button_unpressed.png'],layers=[];
for(const[i,n]of examples.entries())for(const[j,style]of styles.entries())layers.push({input:await render(read(target,n),[.4,-.55,1],150,outputs.get(style).data),left:j*150,top:i*175+25});
const labels=Buffer.from('<svg width="750" height="900"><g fill="white" font-size="12" font-family="Arial">'+styles.map((s,i)=>'<text x="'+(i*150+3)+'" y="16">'+s.replace('.png','')+'</text>').join('')+examples.map((n,i)=>'<text x="4" y="'+(i*175+40)+'">'+n+'</text>').join('')+'</g></svg>');layers.push({input:labels,left:0,top:0});
await sharp({create:{width:750,height:900,channels:4,background:'#1c1e23'}}).composite(layers).png().toFile(path.join(review,'model-preview.png'));
const meta=JSON.parse(fs.readFileSync(path.join(original,'textures.json')));meta.textures.flat.author='Ewan Howell & bl205vn';
for(const[id,value]of Object.entries(meta.textures)){assert.ok(id==='flat'||outputs.has(id+'.png'),'Missing material '+id);for(const variant of Object.keys(value.variants??{}))assert.ok(outputs.has(variant+'.png'),'Missing variant '+variant);}
for(const[f,h]of inputs)assert.equal(hash(f),h,'Protected input changed '+f);
if(apply){
 for(const[file,p]of outputs){const dest=path.join(target,'textures',file);if(fs.existsSync(dest)){fs.mkdirSync(path.join(review,'previous-textures'),{recursive:true});fs.copyFileSync(dest,path.join(review,'previous-textures',file));}fs.copyFileSync(p.file,dest);assert.ok(fs.readFileSync(dest).equals(fs.readFileSync(p.file)));}
 fs.copyFileSync(metadataFile,path.join(review,'textures-before.json'));fs.writeFileSync(metadataFile,JSON.stringify(meta,null,2)+'\n');
}
for(const[f,h]of inputs)if(!(apply&&(f===metadataFile||[...outputs.keys()].some(n=>f===path.join(target,'textures',n)))))assert.equal(hash(f),h,'Input modified '+f);
const report={apply,source:original,target,materials:reports.length,overlayPixels,flatAndModelsUnchanged:true,allSourceFilesUnchanged:true,guiVerified:false,currentModelUVSeamsNotResolvedByThisStep:true,review,textures:reports};
fs.writeFileSync(path.join(review,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'backups/block-materials-last.txt'),review);console.log(JSON.stringify({...report,textures:undefined},null,2));
