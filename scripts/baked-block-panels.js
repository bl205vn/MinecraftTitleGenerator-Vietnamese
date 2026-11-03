import fs from 'node:fs';
import vm from 'node:vm';
import {Canvas} from 'skia-canvas';
// Compile/review uses the same rasterizer as the installed plugin.
const plugin=fs.readFileSync(new URL('../plugin/minecraft_title_generator.js',import.meta.url),'utf8');
const begin=plugin.indexOf('  // BEGIN BAKED BLOCK PANELS'),end=plugin.indexOf('  // END BAKED BLOCK PANELS');
if(begin<0||end<0)throw Error('Missing baked panel runtime');
class CanvasFrame{constructor(width,height){this.width=width;this.height=height;this.canvas=new Canvas(width,height);this.ctx=this.canvas.getContext('2d');this.canvas.toDataURL=()=>this.canvas.toDataURLSync('png');}}
const context=vm.createContext({CanvasFrame,structuredClone,console});
vm.runInContext(plugin.slice(begin,end)+'\nthis.bake=bakeBlockPanels;this.instances=bakedBlockInstances;',context);
export function bakeBlockSurface(font,text,sourceCanvas,flatCanvas,args={}){
 return context.bake({...font,textureWidth:font.textureWidth??1000,textureHeight:font.textureHeight??320},text,args,sourceCanvas,flatCanvas);
}
export function blockInstances(font,text,args,baked){return context.instances(font,text,args,baked);}
