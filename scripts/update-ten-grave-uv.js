// Move composed grave faces to the authored template without rebuilding geometry.
// Existing joined borders, face masks and non-grave elements remain untouched.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dir=path.join(root,'fonts/minecraft-ten-vietnamese/characters');
const apply=process.argv.includes('--apply');
assert.ok(process.argv.slice(2).every(a=>a==='--apply'));
const positive=e=>e.to.every((v,i)=>v>e.from[i]);
const template=JSON.parse(fs.readFileSync(path.join(dir,'grave.json'),'utf8')).elements.filter(positive);
assert.equal(template.length,1);
const replacement=template[0];
assert.deepEqual(replacement.faces.north.uv,[3.76,10.4,4.016,11]);
const oldNorth=[3.728,10.4,3.472,11];
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const plans=[];
for(const name of fs.readdirSync(dir).filter(n=>n.endsWith('.json')&&n!=='grave.json'&&(n.includes('grave')||n.normalize('NFD').includes('\u0300')))){
  const file=path.join(dir,name),raw=fs.readFileSync(file,'utf8'),before=JSON.parse(raw),after=structuredClone(before);
  const marks=after.elements.filter(e=>positive(e)&&same(e.faces.north?.uv,oldNorth));
  if(!marks.length){
    assert.equal(after.elements.filter(e=>positive(e)&&same(e.faces.north?.uv,replacement.faces.north.uv)).length,1,name+' has no recognized grave');
    continue;
  }
  assert.equal(marks.length,1,name);
  const e=marks[0];
  assert.deepEqual(e.to.map((v,i)=>v-e.from[i]),replacement.to.map((v,i)=>v-replacement.from[i]));
  const changes=new Map();
  for(const [side,face]of Object.entries(e.faces)){
    assert.ok(replacement.faces[side],name+': no template face '+side);
    changes.set(JSON.stringify(face.uv),replacement.faces[side].uv);
    face.uv=structuredClone(replacement.faces[side].uv);
  }
  // Preserve original JSON formatting, changing only the selected UV arrays.
  const text=raw.replace(/("uv"\s*:\s*)\[([^\]]+)\]/g,(all,prefix,values)=>{
    const uv=changes.get(JSON.stringify(JSON.parse('['+values+']')));
    return uv?prefix+JSON.stringify(uv):all;
  });
  assert.deepEqual(JSON.parse(text),after,'Unexpected UV replacement in '+name);
  const reverted=structuredClone(after);
  reverted.elements[after.elements.indexOf(e)]=structuredClone(before.elements[after.elements.indexOf(e)]);
  assert.deepEqual(reverted,before,'Non-grave element changed in '+name);
  plans.push({name,file,raw,text});
}
assert.ok(plans.length===0||plans.length===15,'Expected exactly 15 grave composites');
let backup=null;
if(apply&&plans.length){
  backup=fs.mkdtempSync(path.join(root,'backups/ten-grave-uv-'));
  for(const p of plans){
    assert.equal(fs.readFileSync(p.file,'utf8'),p.raw,'Concurrent edit: '+p.name);
    fs.writeFileSync(path.join(backup,p.name),p.raw);
    fs.writeFileSync(p.file,p.text);
    assert.equal(fs.readFileSync(p.file,'utf8'),p.text);
  }
}
console.log(JSON.stringify({apply,models:plans.map(p=>p.name),geometryAndJoinedBordersPreserved:true,existingFaceMasksPreserved:true,backup},null,2));
