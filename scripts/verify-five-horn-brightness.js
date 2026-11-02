// Execute actual plugin painting blocks on Canvas at multiple atlas scales.
import fs from 'node:fs';import assert from 'node:assert/strict';import vm from 'node:vm';import {fileURLToPath} from 'node:url';import {Canvas,loadImage} from 'skia-canvas';import sharp from 'sharp';
const root=new URL('../',import.meta.url),backup=fs.readFileSync(new URL('backups/five-horn-brightness-last.txt',root),'utf8');
const current=fs.readFileSync(new URL('plugin/minecraft_title_generator.js',root),'utf8'),previous=fs.readFileSync(backup+'/plugin/minecraft_title_generator.js','utf8');
const config=JSON.parse(fs.readFileSync(new URL('fonts.json',root),'utf8')),oldConfig=JSON.parse(fs.readFileSync(backup+'/fonts.json','utf8'));
const defaults=vm.runInNewContext(current.slice(current.indexOf('  const fonts = {'),current.indexOf('  const fontData = []'))+'\nfonts;',{thumbnail:'',shapeThumbnail:''});
function font(list,id){for(const p of list){if(p.id===id)return{...defaults[p.id],...p};const v=p.variants?.find(v=>v.id===id);if(v)return{...defaults[p.id],...p,...v};}throw Error(id);}
class CanvasFrame{constructor(w,h){this.canvas=new Canvas(w,h);this.ctx=this.canvas.getContext('2d');}get width(){return this.canvas.width;}get height(){return this.canvas.height;}}
function helpers(text){return ['collectTileableUVRegions','clipFontCapRegions'].map(name=>text.match(new RegExp('  function '+name+'\\([\\s\\S]*?\\n  \\}'))?.[0]??'').join('\n');}
function block(text,mode){if(mode==='tileable'){const start=text.indexOf('      for (const [i, char] of Object.values('),end=text.indexOf('      if (fonts[args.font].overlay',start);return text.slice(start,end);}if(mode==='gradient'){const start=text.indexOf('      ctx.fillStyle = `rgba(0, 0, 0, ${(100 - args.edgeBrightness) / 100})`;'),end=text.indexOf('      if (fonts[args.font].overlay',start);return text.slice(start,end);}const start=text.indexOf('    if (args.customEdge) {'),end=text.indexOf('    if (args.customOverlay',start);return text.slice(start,end);}
async function paint(text,meta,res,mode){const canvas=new Canvas(1000*res,320*res),ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;
 if(mode==='tileable')ctx.drawImage(await loadImage(fileURLToPath(new URL(`fonts/${meta.id}/textures/flat.png`,root))),0,0,canvas.width,canvas.height);else{ctx.fillStyle='#c8b4a0';ctx.fillRect(0,0,canvas.width,canvas.height);}
 ctx.globalCompositeOperation='source-atop';const texture=new Canvas(16,16),tc=texture.getContext('2d');tc.fillStyle='#c8b4a0';tc.fillRect(0,0,16,16);
 const data=JSON.parse(fs.readFileSync(new URL(`fonts/${meta.id}/characters.json`,root),'utf8'));
 const context=vm.createContext({fonts:{[meta.id]:{...meta,characters:data}},args:{font:meta.id,edgeBrightness:20,customEdge:true,customEdgeColour:'#123456'},CanvasFrame,canvas,ctx,texture,res,m:res,uvScaleW:62.5*res,uvScaleH:20*res,width:16*res,height:16*res});
 vm.runInContext(helpers(text)+'\n'+block(text,mode),context);return sharp(await canvas.toBuffer('png')).ensureAlpha().raw().toBuffer();}
const reports=[];
for(const res of [1,2])for(const mode of ['tileable','gradient','customEdge']){
 const before=await paint(previous,font(oldConfig,'minecraft-five-vietnamese'),res,mode),after=await paint(current,font(config,'minecraft-five-vietnamese'),res,mode);let changed=0;
 for(let y=0;y<320*res;y++)for(let x=0;x<1000*res;x++){const i=(y*1000*res+x)*4;if(before.subarray(i,i+4).equals(after.subarray(i,i+4)))continue;changed++;assert.ok(x>=924*res&&x<930*res&&y>=74*res&&y<80*res,`${mode}: changed outside horn at ${x},${y}`);assert.deepEqual([...after.subarray(i,i+4)],[200,180,160,255]);}
 assert.equal(changed,36*res*res);
 // The real neighboring cap remains shaded/recolored.
 const cap=((75*res)*1000*res+934*res)*4;assert.deepEqual([...after.subarray(cap,cap+4)],[...before.subarray(cap,cap+4)]);
 reports.push({res,mode,changedPixels:changed,onlyHornChanged:true});
}
for(const id of ['minecraft-five','minecraft-ten','minecraft-ten-vietnamese'])for(const mode of ['tileable','gradient','customEdge']){
 const old=await paint(previous,font(oldConfig,id),1,mode),now=await paint(current,font(config,id),1,mode);assert.ok(old.equals(now),id+' regression '+mode);
}
fs.writeFileSync(backup+'/verification.json',JSON.stringify({reports,otherFontsPixelIdentical:true,guiVerified:false},null,2));console.log(JSON.stringify({reports,otherFontsPixelIdentical:true},null,2));
