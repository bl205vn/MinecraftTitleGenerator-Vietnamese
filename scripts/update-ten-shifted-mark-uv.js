// Shift only visible mark UVs. Do not regenerate geometry or joined borders.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {vietnameseHelperStems,getVietnameseCharacterKey} from './vietnamese-character-map.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const font=path.join(root,'fonts/minecraft-ten-vietnamese'),dir=path.join(font,'characters');
const apply=process.argv.includes('--apply');
assert.ok(process.argv.slice(2).every(a=>a==='--apply'));
const rules=[['hookabove','\u0309',253,208,18,14],['tilde','\u0303',273,208,26,11],['dotbelow','\u0323',301,247,10,9],['breve','\u0306',313,208,20,12]];
const positive=e=>e.to.every((v,i)=>v>e.from[i]);
const near=(a,b)=>Math.abs(a-b)<1e-8;
const round=n=>Math.round(n*1e10)/1e10;
const plans=[],counts=Object.fromEntries(rules.map(r=>[r[0],0]));
for(const [name,,x,y,w,h]of rules){
  const model=JSON.parse(fs.readFileSync(path.join(dir,name+'.json')));
  assert.ok(model.elements.some(e=>positive(e)&&e.faces.north&&e.faces.north.uv.every((n,i)=>near(n,[x/62.5,y/20,(x+w)/62.5,(y+h)/20][i]))),'Unexpected helper UV: '+name);
}
for(const file of fs.readdirSync(dir).filter(f=>f.endsWith('.json'))){
  const stem=file.slice(0,-5);if(vietnameseHelperStems.has(stem))continue;
  const nfd=getVietnameseCharacterKey(stem).normalize('NFD');
  const relevant=rules.filter(r=>nfd.includes(r[1]));if(!relevant.length)continue;
  const full=path.join(dir,file),raw=fs.readFileSync(full,'utf8'),before=JSON.parse(raw),after=structuredClone(before),changes=new Map(),updated=[];
  for(const [name,,x,y,w,h]of relevant){
    const matches=after.elements.filter(e=>positive(e)&&e.faces.north&&near(Math.min(e.faces.north.uv[0],e.faces.north.uv[2])*62.5,x-18)&&near(Math.min(e.faces.north.uv[1],e.faces.north.uv[3])*20,y)&&near(Math.abs(e.faces.north.uv[2]-e.faces.north.uv[0])*62.5,w)&&near(Math.abs(e.faces.north.uv[3]-e.faces.north.uv[1])*20,h));
    if(!matches.length){
      assert.ok(after.elements.some(e=>positive(e)&&e.faces.north&&near(Math.min(e.faces.north.uv[0],e.faces.north.uv[2])*62.5,x)&&near(Math.min(e.faces.north.uv[1],e.faces.north.uv[3])*20,y)),'Missing mark '+name+' in '+file);
      continue;
    }
    assert.equal(matches.length,1,file+': '+name);
    const e=matches[0];
    for(const f of Object.values(e.faces)){
      const old=JSON.stringify(f.uv),uv=f.uv.map((v,i)=>i%2?v:round(v+18/62.5));
      changes.set(old,uv);f.uv=uv;
    }
    updated.push(after.elements.indexOf(e));counts[name]++;
  }
  if(!updated.length)continue;
  const text=raw.replace(/("uv"\s*:\s*)\[([^\]]+)\]/g,(all,prefix,values)=>{
    const uv=changes.get(JSON.stringify(JSON.parse('['+values+']')));return uv?prefix+JSON.stringify(uv):all;
  });
  assert.deepEqual(JSON.parse(text),after,'Unexpected replacement: '+file);
  const reverted=structuredClone(after);for(const i of updated)reverted.elements[i]=before.elements[i];
  assert.deepEqual(reverted,before,'Other elements changed: '+file);
  for(const i of updated){assert.deepEqual(after.elements[i].from,before.elements[i].from);assert.deepEqual(after.elements[i].to,before.elements[i].to);assert.deepEqual(Object.keys(after.elements[i].faces),Object.keys(before.elements[i].faces));}
  plans.push({file,full,raw,text});
}
let backup=null;
if(apply&&plans.length){
  backup=fs.mkdtempSync(path.join(root,'backups/ten-shifted-mark-uv-'));fs.mkdirSync(path.join(backup,'characters'));
  const protectedFiles=[path.join(font,'textures.json'),...fs.readdirSync(dir).map(f=>path.join(dir,f)).filter(f=>fs.statSync(f).isFile()&&!plans.some(p=>p.full===f)),...['textures','overlays'].flatMap(sub=>fs.readdirSync(path.join(font,sub)).map(f=>path.join(font,sub,f)).filter(f=>fs.statSync(f).isFile()))];
  const digest=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
  fs.writeFileSync(path.join(backup,'protected-hashes.json'),JSON.stringify(Object.fromEntries(protectedFiles.map(f=>[f,digest(f)]))));
  fs.copyFileSync(path.join(font,'characters.json'),path.join(backup,'characters.json'));
  for(const p of plans){assert.equal(fs.readFileSync(p.full,'utf8'),p.raw);fs.writeFileSync(path.join(backup,'characters',p.file),p.raw);fs.writeFileSync(p.full,p.text);}
  fs.writeFileSync(path.join(root,'backups/ten-shifted-mark-last.txt'),backup);
}
console.log(JSON.stringify({apply,models:plans.length,markCounts:counts,files:plans.map(p=>p.file),geometryJoinedBordersAndFaceMasksPreserved:true,backup},null,2));
