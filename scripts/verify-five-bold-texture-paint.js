// Run the plugin's actual material-painting loop on the registered Bold atlas.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {Canvas,loadImage} from 'skia-canvas';
import sharp from 'sharp';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url),id='minecraft-five-bold-vietnamese';
const source=fs.readFileSync(new URL('plugin/minecraft_title_generator.js',root),'utf8');
const parents=JSON.parse(fs.readFileSync(new URL('fonts.json',root))),parent=parents.find(f=>f.id==='minecraft-five-bold');
const font={...parent,...parent.variants.find(v=>v.id===id),characters:JSON.parse(fs.readFileSync(new URL(`fonts/${id}/characters.json`,root)))};
const file=new URL(`fonts/${id}/textures/flat.png`,root),input=await sharp(fileURLToPath(file)).ensureAlpha().raw().toBuffer();
const helper=['collectTileableUVRegions','clipFontCapRegions'].map(name=>source.match(new RegExp('  function '+name+'\\([\\s\\S]*?\\n  \\}'))[0]).join('\n');
const start=source.indexOf('      for (const [i, char] of Object.values('),end=source.indexOf('      if (fonts[args.font].overlay',start),block=source.slice(start,end);
class CanvasFrame{constructor(w,h){this.canvas=new Canvas(w,h);this.ctx=this.canvas.getContext('2d');}get width(){return this.canvas.width;}get height(){return this.canvas.height;}}
const reports=[];
for(const res of [1,2]){
 const canvas=new Canvas(1000*res,320*res),ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.drawImage(await loadImage(fileURLToPath(file)),0,0,canvas.width,canvas.height);ctx.globalCompositeOperation='source-atop';
 const texture=new Canvas(16,16),tc=texture.getContext('2d');tc.fillStyle='#c8b4a0';tc.fillRect(0,0,16,16);
 const sandbox=vm.createContext({fonts:{[id]:font},args:{font:id,edgeBrightness:20},CanvasFrame,canvas,ctx,texture,res,uvScaleW:62.5*res,uvScaleH:20*res,width:16*res,height:16*res});
 vm.runInContext(helper+'\n'+block,sandbox);
 const result=await sharp(await canvas.toBuffer('png')).ensureAlpha().raw().toBuffer();let checked=0,horn=0;
 for(let y=0;y<320;y++)for(let x=0;x<1000;x++){
  const at=(y*1000+x)*4;if(input[at+3]<128||input[at]!==255||input[at+1]!==255||input[at+2]!==255)continue;
  for(let j=0;j<res;j++)for(let i=0;i<res;i++){
   const out=((y*res+j)*1000*res+x*res+i)*4;
   assert.deepEqual([...result.subarray(out,out+4)],[200,180,160,255],`Unpainted/darkened front at ${x},${y}, scale ${res}`);checked++;
  }
  if(x>=280&&x<288&&y>=148&&y<154)horn++;
 }
 assert.equal(horn,48);reports.push({res,frontPixelsVerified:checked,hornPixels:horn});
}
console.log(JSON.stringify({font:id,actualPluginPaintLoop:true,allWhiteAtlasPixelsRepainted:true,reports},null,2));
