// Validate the installed, hand-arranged Bold Vietnamese prototype atlas.
// --apply is accepted for compatibility and never repaints existing assets.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {white as fiveWhite,positive} from './five-model-geometry.js';
import {uv,pixel} from './five-offline-render.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.join(root,'fonts/minecraft-five-vietnamese'),target=path.join(root,'fonts/minecraft-five-bold-vietnamese');
assert.ok(process.argv.slice(2).every(a=>a==='--apply'));
const {data}=await sharp(path.join(target,'textures/flat.png')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const read=(base,name)=>JSON.parse(fs.readFileSync(path.join(base,'characters',name+'.json')));
const normalized=cells=>{const ps=[...cells].map(p=>p.split(',').map(Number)),x0=Math.min(...ps.map(p=>p[0])),x1=Math.max(...ps.map(p=>p[0]))+1,y0=Math.min(...ps.map(p=>p[1])),y1=Math.max(...ps.map(p=>p[1]))+1;return{w:x1-x0,h:y1-y0,cells:new Set(ps.map(([x,y])=>(x1-x-1)+','+(y1-y-1)))};};
function grow(pattern){const ps=new Set();for(const p of pattern.cells){const[x,y]=p.split(',').map(Number);for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++)ps.add((x+i+1)+','+(y+j+1));}return{w:pattern.w+2,h:pattern.h+2,cells:ps};}
const specs=[['grave',128,148],['acute',144,148],['hookabove',160,148],['breve',182,148],['đ',210,154],['ư',250,148],['ơ',300,154]];
// The installed, hand-arranged atlas is authoritative. Re-running this script
// validates the relocated templates; it must never repaint the user's texture.
if(specs.every(([name])=>fs.existsSync(path.join(target,'characters',name+'.json')))){
 const installed=specs.map(([name,x,y])=>{
  const m=read(target,name),es=m.elements.filter(e=>positive(e)&&e.faces.north),p=grow(normalized(fiveWhite(read(source,name).elements)));
  const actual=new Set();for(const e of es)for(let yy=e.from[1];yy<e.to[1];yy++)for(let xx=e.from[0];xx<e.to[0];xx++){const c=pixel(...uv(e,'north',[xx+.5,yy+.5,8]),data);if(c[3]&&c[0]===255)actual.add(xx+','+yy);}
  assert.deepEqual(normalized(actual),p,name+' relocated silhouette');
  for(const e of es){const u=e.faces.north.uv.map((v,i)=>v*(i%2?20:62.5));assert.ok(u[0]>=x-1e-6&&u[2]<=x+p.w+1e-6&&u[1]>=y-1e-6&&u[3]<=y+p.h+1e-6,name+' relocated front UV');}
  return{name,front:[x,y,p.w,p.h],cubes:m.elements.length};
 });
 console.log(JSON.stringify({mode:'validate-installed',atlasUnchanged:true,installed},null,2));process.exit(0);
}
throw Error('Restore missing templates from Git before validating the installed atlas.');
