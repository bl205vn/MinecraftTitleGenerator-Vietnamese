// Cyrillic й-style caps: delete WHOLE facing white caps, preserve every border element.
// Dry run by default; --apply backs up current model files before writing.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const font=path.join(root,'fonts/minecraft-ten-vietnamese'),chars=path.join(font,'characters');
const apply=process.argv.includes('--apply');
assert.ok(process.argv.slice(2).every(a=>a==='--apply'));
const white=e=>e.to.every((v,i)=>v>e.from[i])&&!!e.faces.north;
const digest=b=>createHash('sha256').update(b).digest('hex');
const table = fs.readFileSync(path.join(font, 'Các ký tự tiếng việt/Vị trí chữ.txt'), 'utf8');
const tones = { '\u0300': 'grave', '\u0301': 'acute', '\u0309': 'hookabove', '\u0303': 'tilde', '\u0323': 'dotbelow' };
let group = -1;
const targets = [];
for (const line of table.split(/\r?\n/)) {
  if (/^\d+\./.test(line)) group++;
  const match = line.match(/^\s*-\s*(\S):/); if (!match) continue;
  const char = match[1], nfd = char.normalize('NFD'), structural = nfd.includes('\u0302') ? 'circumflex' : nfd.includes('\u0306') ? 'breve' : null;
  const tone = Object.entries(tones).find(([code]) => nfd.includes(code))?.[1];
  if (!structural && !tone) continue;
  const filename = group === 0 ? ['creeper', structural, tone].filter(Boolean).join('_') + '.json' : char + '.json';
  targets.push({ char, filename });
}
assert.equal(targets.length, 81);
const plans=[],records=[];let cubesBefore=0,cubesAfter=0,facesBefore=0,facesAfter=0;
const atlasFile=path.join(font,'textures/flat.png'),atlasBefore=fs.readFileSync(atlasFile);
for(const target of targets){
  const file=path.join(chars,target.filename),raw=fs.readFileSync(file,'utf8'),old=JSON.parse(raw),model=structuredClone(old);
  const whites=old.elements.map((e,index)=>({e,index})).filter(({e})=>white(e));
  assert.ok(whites.every(({e})=>!e.rotation?.angle),'Rotated white component needs manual review');
  const components=whites.map(({e,index})=>({index,name:e.name,x0:e.from[0],x1:e.to[0],z0:e.from[2],z1:e.to[2],lo:e.from[1],hi:e.to[1]})).sort((a,b)=>a.lo-b.lo);
  const contacts=[],removed=[];
  for(let i=0;i<components.length;i++)for(let j=i+1;j<components.length;j++){
    const lower=components[i],upper=components[j],gap=upper.lo-lower.hi;
    // Preserve the internal construction of base letters such as ơ and ư.
    if(lower.name.split('_cube')[0]===upper.name.split('_cube')[0]||gap<0)continue;
    // Each component's border extends 2 units: a white gap >4 means detached outlines.
    if(gap>4+1e-7||Math.min(lower.x1,upper.x1)-Math.max(lower.x0,upper.x0)<=0||Math.min(lower.z1,upper.z1)-Math.max(lower.z0,upper.z0)<=0)continue;
    contacts.push({lower:lower.name,upper:upper.name,whiteGap:gap});
    for(const [c,side]of [[lower,'up'],[upper,'down']])if(model.elements[c.index].faces[side]){
      delete model.elements[c.index].faces[side];removed.push({element:c.name,index:c.index+1,side});
    }
  }
  // Prove that the only changes are whole cap-face deletions from positive white elements.
  assert.equal(model.elements.length,old.elements.length);
  for(let i=0;i<old.elements.length;i++){
    const expected=structuredClone(old.elements[i]);
    for(const r of removed.filter(r=>r.index===i+1))delete expected.faces[r.side];
    assert.deepEqual(model.elements[i],expected);
    if(!white(old.elements[i]))assert.deepEqual(model.elements[i],old.elements[i]);
  }
  const fc=m=>m.elements.reduce((n,e)=>n+Object.keys(e.faces).length,0);
  cubesBefore+=old.elements.length;cubesAfter+=model.elements.length;facesBefore+=fc(old);facesAfter+=fc(model);
  if(!removed.length)continue;
  // Remove just the relevant JSON face lines, preserving all remaining bytes and UV formatting.
  let elementIndex=-1,inElements=false;
  const removals=new Set(removed.map(r=>(r.index-1)+'/'+r.side));
  let output=raw.split(/(?<=\n)/).filter(line=>{
    if(/^\t"elements": \[/.test(line)){inElements=true;return true;}
    if(inElements&&/^\t\t\{\s*$/.test(line))elementIndex++;
    const face=line.match(/^\t\t\t\t"(up|down)":/);
    return !(face&&removals.has(elementIndex+'/'+face[1]));
  }).join('').replace(/,(\r?\n\s*\})/g,'$1');
  assert.deepEqual(JSON.parse(output),model);
  records.push({...target,contacts,removedFaces:removed});plans.push({file,raw,output});
}
const summary={method:'Delete whole facing white caps as in Cyrillic й; leave all border cubes and UVs unchanged',inspected:targets.length,filesToChange:plans.length,cubesBefore,cubesAfter,facesBefore,facesAfter,removedWhiteCaps:facesBefore-facesAfter,borderElementsUnchanged:true,whiteGeometryAndRemainingUVUnchanged:true,atlasSHA256:digest(atlasBefore),records};
if(apply&&plans.length){
  for(const p of plans)assert.equal(fs.readFileSync(p.file,'utf8'),p.raw,'Concurrent edit');
  assert.ok(fs.readFileSync(atlasFile).equals(atlasBefore));
  fs.mkdirSync(path.join(root,'backups'),{recursive:true});
  const backup=fs.mkdtempSync(path.join(root,'backups/cyrillic-white-caps-'));fs.mkdirSync(path.join(backup,'characters'));
  for(const p of plans)fs.writeFileSync(path.join(backup,'characters',path.basename(p.file)),p.raw,{flag:'wx'});
  summary.backup=backup;fs.writeFileSync(path.join(backup,'manifest.json'),JSON.stringify(summary,null,2)+'\n');
  for(const p of plans){assert.equal(fs.readFileSync(p.file,'utf8'),p.raw);fs.writeFileSync(p.file,p.output);assert.equal(fs.readFileSync(p.file,'utf8'),p.output);}
  assert.ok(fs.readFileSync(atlasFile).equals(atlasBefore));
}
console.log(JSON.stringify({...summary,records:undefined},null,2));
