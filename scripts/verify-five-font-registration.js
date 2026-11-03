// Registry inheritance, compiled keys and actual plugin UV-region coverage.
import fs from 'node:fs';import assert from 'node:assert/strict';import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root),'utf8');
const id=process.argv[2]??'minecraft-five-vietnamese';
assert.ok(['minecraft-five-vietnamese','minecraft-five-bold-vietnamese'].includes(id));
const bold=id==='minecraft-five-bold-vietnamese';
const config=JSON.parse(read('fonts.json')),parent=config.find(f=>f.id===(bold?'minecraft-five-bold':'minecraft-five'));
const variant=parent.variants.find(f=>f.id===id),font={...parent,...variant};
assert.equal(variant.name,'Vietnamese');assert.equal(variant.preview,'việ');assert.equal(font.height,bold?36:34);assert.equal(font.border,bold?212:206);
assert.equal(font.faces.length,font.ends.length);for(const band of font.faces)assert.ok([2,4].includes(band.length)&&band.every(Number.isFinite));
const source=read('plugin/minecraft_title_generator.js'),snippet=source.match(/  function collectTileableUVRegions\([\s\S]*?\n  \}/)[0];
const collect=vm.runInNewContext(snippet+'\ncollectTileableUVRegions;'),data=JSON.parse(read(`fonts/${id}/characters.json`));
let checked=0;
for(const res of [1,2])for(const [char,elements]of Object.entries(data)){
 assert.equal([...char].length,1);
 const regions=Object.values(collect(elements,font,62.5*res,20*res,res)).flat();
 for(const e of elements)if(e.to.every((v,i)=>v>e.from[i])&&e.faces.north)for(const side of ['north','south','up','down']){
  const uv=e.faces[side];if(!uv)continue;
  const [x0,x1]=[Math.min(uv[0],uv[2])*62.5*res,Math.max(uv[0],uv[2])*62.5*res];
  const [y0,y1]=[Math.min(uv[1],uv[3])*20*res,Math.max(uv[1],uv[3])*20*res];
  if(y0>=font.border*res)continue;
  assert.ok(regions.some(r=>r[0]<=x0+.1&&r[2]>=x1-.1&&r[1]<=y0+.1&&r[3]>=y1-.1),JSON.stringify({char,side,uv,regions}));checked++;
 }
}
assert.equal(Object.keys(data).length,155);
console.log(JSON.stringify({variantOf:parent.id,id:variant.id,characters:155,checkedUVFaces:checked,resolutions:[1,2]},null,2));
