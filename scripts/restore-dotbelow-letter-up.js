// Restore dot-below body caps exactly from before 227d301; no other faces change.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {vietnameseCreeperCharacters as creepers} from './vietnamese-character-map.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const apply=process.argv.includes('--apply');
assert.ok(process.argv.slice(2).every(a=>a==='--apply'));
const reference='227d301^';
const original=file=>execFileSync('git',['show',reference+':'+file.replaceAll('\\','/')],{cwd:root,encoding:'utf8',maxBuffer:10*1024*1024});
const plans=[],summary=[];
for(const id of ['minecraft-ten-vietnamese','minecraft-five-vietnamese','minecraft-five-bold-vietnamese']){
 const dir=path.join('fonts',id,'characters'),registry=path.join('fonts',id,'characters.json');
 const rawData=fs.readFileSync(path.join(root,registry),'utf8'),data=JSON.parse(rawData),oldData=JSON.parse(original(registry)),beforeData=structuredClone(data);
 const changes=[];
 for(const file of fs.readdirSync(path.join(root,dir)).filter(f=>f.endsWith('.json'))){
  const stem=file.slice(0,-5),key=creepers[stem]??stem;
  if(Array.from(key).length!==1||!key.normalize('NFD').includes('\u0323'))continue;
  const relative=path.join(dir,file),raw=fs.readFileSync(path.join(root,relative),'utf8'),current=JSON.parse(raw),oldRaw=original(relative),old=JSON.parse(oldRaw);
  assert.equal(current.elements.length,old.elements.length);
  const expected=structuredClone(old),indices=[];
  for(let i=0;i<old.elements.length;i++){
   const e=old.elements[i];
   if(e.to.every((v,a)=>v>e.from[a])&&e.faces.up&&!current.elements[i].faces.up){delete expected.elements[i].faces.up;indices.push(i);}
  }
  if(!indices.length){assert.deepEqual(current,old);continue;}
  assert.deepEqual(current,expected,'Changes beyond body Up: '+relative);
  for(const i of indices){assert.ok(!data[key][i].faces.up);data[key][i].faces.up=structuredClone(oldData[key][i].faces.up);}
  plans.push({file:relative,before:raw,after:oldRaw});changes.push({file,indices});
 }
 const check=structuredClone(data);
 for(const {file,indices}of changes){const stem=file.slice(0,-5),key=creepers[stem]??stem;for(const i of indices)delete check[key][i].faces.up;}
 assert.deepEqual(check,beforeData,'Unexpected registry change');
 if(changes.length)plans.push({file:registry,before:rawData,after:JSON.stringify(data)+(rawData.endsWith('\n')?'\n':'')});
 summary.push({font:id,restoredModels:changes.length,changes});
}
let backup;
if(apply&&plans.length){
 backup=fs.mkdtempSync(path.join(root,'backups/dotbelow-body-up-'));
 for(const p of plans){assert.equal(fs.readFileSync(path.join(root,p.file),'utf8'),p.before);const out=path.join(backup,p.file);fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,p.before);}
 fs.writeFileSync(path.join(backup,'manifest.json'),JSON.stringify({reference,summary},null,2));
 for(const p of plans){fs.writeFileSync(path.join(root,p.file),p.after);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,p.file),'utf8')),JSON.parse(p.after));}
}
console.log(JSON.stringify({apply,reference,backup,summary:summary.map(({changes,...s})=>s)},null,2));
