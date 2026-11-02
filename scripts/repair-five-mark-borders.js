// JSON-only repair. Existing PNGs are inputs; never paint a new atlas mask.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const font=path.join(root,'fonts/minecraft-five-vietnamese');
const apply=process.argv.includes('--apply');
const names=['ư','hookabove','grave','breve','acute'];
const digest=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const files=fs.readdirSync(path.join(font,'characters')).map(f=>path.join(font,'characters',f));
const protectedFiles=[...files.filter(f=>!names.some(n=>f.endsWith('/'+n+'.json')||f.endsWith('\\'+n+'.json'))),...['textures','overlays'].flatMap(d=>fs.existsSync(path.join(font,d))?fs.readdirSync(path.join(font,d)).map(f=>path.join(font,d,f)).filter(f=>fs.statSync(f).isFile()):[])];
const hashes=Object.fromEntries(protectedFiles.map(f=>[f,digest(f)]));
import {white,dilate,cover,shell,bounds,positive,sample,mergeWhite} from './five-model-geometry.js';
const reports=[],outputs=[];
for(const name of names){
 const file=path.join(font,'characters',name+'.json'),raw=fs.readFileSync(file),before=JSON.parse(raw),model=structuredClone(before),cells=white(before.elements),expanded=dilate(cells);
 const whiteElements=mergeWhite(before.elements.filter(e=>positive(e)&&e.faces.north&&white([e]).size).map(e=>structuredClone(e)),cells),solution=cover(expanded),texture=whiteElements[0].faces.north.texture;
 model.elements=[...whiteElements,...solution.rectangles.map(r=>shell(r,expanded,texture))];
 const b=bounds(model.elements),dx=8-(b[0][0]+b[0][1])/2,dz=8-(b[2][0]+b[2][1])/2;
 for(const e of model.elements){for(const k of ['from','to']){e[k][0]+=dx;e[k][2]+=dz;}if(e.rotation){e.rotation.origin[0]+=dx;e.rotation.origin[2]+=dz;}}
 const shifted=new Set([...cells].map(p=>{const[x,y]=p.split(',').map(Number);return key(x+dx,y);}));assert.deepEqual(white(model.elements),shifted);assert.deepEqual(white(model.elements,'south'),shifted,'Back/front mismatch: '+name);
 assert.ok(model.elements.length<=before.elements.length,'Cube count increased: '+name);
 reports.push({name,before:before.elements.length,after:model.elements.length,whiteCubes:whiteElements.length,borderCubes:solution.rectangles.length,centerShift:[dx,0,dz],...solution});
 outputs.push({file,raw,text:JSON.stringify(model,null,'\t')+'\n'});
}
// Read-only audit of the two additional letters.
const audits=[];
for(const name of ['đ','ơ']){
 const model=JSON.parse(fs.readFileSync(path.join(font,'characters',name+'.json'))),front=white(model.elements),back=white(model.elements,'south'),expected=dilate(front),b=bounds(model.elements);
 const checks={};for(const side of ['north','south']){const black=new Set();for(const e of model.elements)if(e.faces[side])for(let y=Math.min(e.from[1],e.to[1]);y<Math.max(e.from[1],e.to[1]);y++)for(let x=Math.min(e.from[0],e.to[0]);x<Math.max(e.from[0],e.to[0]);x++)if(sample(e,side,x+.5,y+.5)===0)black.add(key(x,y));checks[side]={missingBorder:[...expected].filter(p=>!front.has(p)&&!black.has(p)).length,extraBorder:[...black].filter(p=>!expected.has(p)).length};}
 audits.push({name,cubes:model.elements.length,center:[(b[0][0]+b[0][1])/2,(b[2][0]+b[2][1])/2],frontBackWhiteMatch:front.size===back.size&&[...front].every(p=>back.has(p)),...checks});
}
let backup=null;if(apply){backup=fs.mkdtempSync(path.join(root,'backups/five-mark-border-'));for(const o of outputs){assert.ok(fs.readFileSync(o.file).equals(o.raw));fs.writeFileSync(path.join(backup,path.basename(o.file)),o.raw);fs.writeFileSync(o.file,o.text);}fs.writeFileSync(path.join(backup,'protected-hashes.json'),JSON.stringify(hashes,null,2));fs.writeFileSync(path.join(root,'backups/five-mark-border-last.txt'),backup);}
for(const[f,h]of Object.entries(hashes))assert.equal(digest(f),h,'Unrelated file changed: '+f);
const report={apply,reports,audits,texturesAndUnrelatedModelsUnchanged:true,guiVerified:false,backup};if(backup)fs.writeFileSync(path.join(backup,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
