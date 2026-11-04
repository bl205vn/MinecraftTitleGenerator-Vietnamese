// Remove only positive letter-body Up faces in composed Vietnamese glyphs.
// Dot-below glyphs, marks, inverted borders, plain letters, artwork and Block are preserved.
// Dry run by default; --apply backs up source models and compiled registries.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {vietnameseCreeperCharacters as creepers} from './vietnamese-character-map.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const apply=process.argv.includes('--apply');
assert.ok(process.argv.slice(2).every(a=>a==='--apply'));
const ids=['minecraft-ten-vietnamese','minecraft-five-vietnamese','minecraft-five-bold-vietnamese'];
const positive=e=>e.to.every((v,i)=>v>e.from[i]);
const uvBox=u=>[Math.min(u[0],u[2]),Math.min(u[1],u[3]),Math.max(u[0],u[2]),Math.max(u[1],u[3])];
const inside=(a,b)=>a[0]>=b[0]-1e-8&&a[1]>=b[1]-1e-8&&a[2]<=b[2]+1e-8&&a[3]<=b[3]+1e-8;
function elementSpans(raw){
 const begin=raw.indexOf('[',raw.indexOf('"elements"')),out=[];
 let depth=0,start=-1,string=false,escape=false;
 for(let i=begin+1;i<raw.length;i++){
  const c=raw[i];if(string){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')string=false;continue;}
  if(c==='"'){string=true;continue;}if(c==='{'&&depth++===0)start=i;
  if(c==='}'&&--depth===0)out.push([start,i+1]);if(c===']'&&depth===0)break;
 }
 return out;
}
const plans=[],summary=[];
for(const id of ids){
 const dir=path.join(root,'fonts',id,'characters'),dataFile=path.join(root,'fonts',id,'characters.json');
 const dataRaw=fs.readFileSync(dataFile,'utf8'),data=JSON.parse(dataRaw),originalData=structuredClone(data),records=[];
 let composed=0,removed=0;
 for(const file of fs.readdirSync(dir).filter(f=>f.endsWith('.json'))){
  const stem=file.slice(0,-5),key=creepers[stem]??stem;
  if(Array.from(key).length!==1)continue;
  const nfd=key.toLowerCase().normalize('NFD');
  if(nfd.includes('\u0323'))continue; // Keep the body's Up when the glyph has dot below.
  if(!/^[aeiouy][\u0300-\u036f]+$/.test(nfd))continue;
  // Plain horn letters are templates, not composed tone/shape variants.
  if(!/[\u0300\u0301\u0309\u0303\u0323\u0302\u0306]/.test(nfd))continue;
  composed++;
  const plain=JSON.parse(fs.readFileSync(path.join(dir,(creepers[stem]?'creeper':nfd[0])+'.json'),'utf8'));
  const bodyHeight=Math.max(...plain.elements.filter(e=>positive(e)&&e.faces.north).map(e=>e.to[1]-e.from[1]));
  const base=nfd.includes('\u031b')?JSON.parse(fs.readFileSync(path.join(dir,(nfd[0]==='o'?'ơ':'ư')+'.json'),'utf8')):plain;
  const bodyUVs=base.elements.filter(e=>positive(e)&&e.faces.north&&(!nfd.includes('\u031b')||e.to[1]-e.from[1]>=bodyHeight-1e-8)).map(e=>uvBox(e.faces.north.uv));
  const modelFile=path.join(dir,file),raw=fs.readFileSync(modelFile,'utf8'),model=JSON.parse(raw),before=structuredClone(model);
  const body=model.elements.map((e,i)=>positive(e)&&e.faces.north&&bodyUVs.some(b=>inside(uvBox(e.faces.north.uv),b))?i:-1).filter(i=>i>=0);
  assert.ok(body.length,id+'/'+file+' missing letter body');
  const indices=body.filter(i=>model.elements[i].faces.up);
  if(!indices.length)continue;
  assert.ok(data[key],id+'/'+key+' missing compiled key');
  assert.equal(data[key].length,model.elements.length,id+'/'+file+' stale compiled element count');
  const spans=elementSpans(raw);assert.equal(spans.length,model.elements.length);
  let output=raw;
  for(const i of [...indices].reverse()){
   assert.deepEqual(data[key][i].from,model.elements[i].from);
   assert.deepEqual(data[key][i].to,model.elements[i].to);
   assert.deepEqual(data[key][i].faces.north,model.elements[i].faces.north.uv);
   delete model.elements[i].faces.up;delete data[key][i].faces.up;
   const [a,b]=spans[i],part=output.slice(a,b).replace(/"up"\s*:\s*\{[^{}]*\}\s*,?/,'').replace(/,(\s*})/g,'$1').replace(/^[\t ]+\r?\n/gm,'');
   output=output.slice(0,a)+part+output.slice(b);
  }
  assert.deepEqual(JSON.parse(output),model,'Unexpected source edit '+file);
  const restored=structuredClone(model);for(const i of indices)restored.elements[i].faces.up=before.elements[i].faces.up;
  assert.deepEqual(restored,before,'Only body Up may change');
  plans.push({file:modelFile,before:raw,after:output});records.push({file,bodyElements:indices});removed+=indices.length;
 }
 const restored=structuredClone(data);
 for(const record of records){const stem=record.file.slice(0,-5),key=creepers[stem]??stem;for(const i of record.bodyElements)restored[key][i].faces.up=originalData[key][i].faces.up;}
 assert.deepEqual(restored,originalData,'Unexpected compiled change');
 if(records.length)plans.push({file:dataFile,before:dataRaw,after:JSON.stringify(data)+(dataRaw.endsWith('\n')?'\n':'')});
 summary.push({font:id,composedModels:composed,changedModels:records.length,removedBodyUpFaces:removed,records});
}
let backup;
if(apply&&plans.length){
 backup=fs.mkdtempSync(path.join(root,'backups/composed-letter-no-up-'));
 for(const p of plans){assert.equal(fs.readFileSync(p.file,'utf8'),p.before,'Concurrent edit');const dest=path.join(backup,path.relative(root,p.file));fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,p.before);}
 fs.writeFileSync(path.join(backup,'manifest.json'),JSON.stringify(summary,null,2));
 for(const p of plans){assert.equal(fs.readFileSync(p.file,'utf8'),p.before);fs.writeFileSync(p.file,p.after);assert.deepEqual(JSON.parse(fs.readFileSync(p.file,'utf8')),JSON.parse(p.after));}
}
console.log(JSON.stringify({apply,backup,summary:summary.map(({records,...s})=>s)},null,2));
