// Build only the Vietnamese font data. No thumbnail rendering or unrelated font writes.
// node scripts/build-vietnamese-font-data.js [--apply]
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {vietnameseHelperStems as helpers, vietnameseCreeperCharacters as creeperLetters, getVietnameseCharacterKey} from './vietnamese-character-map.js';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const font=path.join(root,'fonts/minecraft-ten-vietnamese');
const apply=process.argv.includes('--apply');
assert.ok(process.argv.slice(2).every(a=>a==='--apply'));
const aliases={asterisk:'*',backwardslash:'\\',colon:':',creeper:'😳',end:'┣',forwardslash:'/',greaterthan:'>',lessthan:'<',openquote:'😩',questionmark:'?',space:' ',spacer:'\u200b',start:'┫'};
const output={},sources=new Map(),skipped=[];
for(const file of fs.readdirSync(path.join(font,'characters')).sort()){
 if(!file.endsWith('.json'))continue;
 const stem=file.slice(0,-5);if(helpers.has(stem)){skipped.push(file);continue;}
 const key=(aliases[stem]??getVietnameseCharacterKey(stem)).normalize('NFC');
 assert.equal(Array.from(key).length,1,'Unmapped model name: '+file);
 assert.ok(!Object.hasOwn(output,key),'Duplicate character key: '+key);
 const model=JSON.parse(fs.readFileSync(path.join(font,'characters',file),'utf8'));
 assert.ok(Array.isArray(model.elements),'Missing elements: '+file);
 const elements=structuredClone(model.elements);
 for(const e of elements){
  delete e.name;
  assert.ok(e.from.length===3&&e.to.length===3&&[...e.from,...e.to].every(Number.isFinite));
  for(const [side,face]of Object.entries(e.faces)){
   assert.ok(['north','south','east','west','up','down'].includes(side));
   assert.ok(Array.isArray(face.uv)&&face.uv.length===4&&face.uv.every(Number.isFinite),'Invalid UV: '+file);
   assert.ok(!face.rotation||face.rotation===180,'Unsupported face rotation: '+file);
   e.faces[side]=face.rotation===180?[...face.uv.slice(2),...face.uv.slice(0,2)]:[...face.uv];
  }
 }
 output[key]=elements;sources.set(key,file);
}
for(const [file,key]of Object.entries(creeperLetters))assert.equal(sources.get(key),file+'.json');
for(const name of helpers)assert.ok(!Object.hasOwn(output,name));
// Full Vietnamese lower-case alphabet plus all five tones on the twelve vowels.
const vowels='aăâeêioôơuưy';
const tones=['','\u0300','\u0301','\u0309','\u0303','\u0323'];
const vietnamese=new Set(['đ']);
for(const vowel of vowels)for(const tone of tones)vietnamese.add((vowel.normalize('NFD')+tone).normalize('NFC'));
for(const key of vietnamese)assert.ok(Object.hasOwn(output,key),'Missing Vietnamese character: '+key);
const charText=JSON.stringify(output,null,2)+'\n';
const textureFile=path.join(font,'textures.json');
const textureText=fs.existsSync(textureFile)?fs.readFileSync(textureFile,'utf8'):JSON.stringify({textures:{flat:{author:'Ewan Howell & bl205vn'}},overlays:{}},null,2)+'\n';
const textures=JSON.parse(textureText);
assert.equal(Object.keys(textures.textures)[0],'flat');
for(const id of Object.keys(textures.textures))assert.ok(fs.existsSync(path.join(font,'textures',id+'.png')),'Missing texture: '+id);
const plans=[['characters.json',charText],['textures.json',textureText]].map(([name,text])=>({name,text,file:path.join(font,name)})).map(p=>({...p,old:fs.existsSync(p.file)?fs.readFileSync(p.file,'utf8'):null})).filter(p=>p.text!==p.old);
let backup=null;
if(apply&&plans.length){
 for(const p of plans)assert.equal(fs.existsSync(p.file)?fs.readFileSync(p.file,'utf8'):null,p.old,'Concurrent output edit');
 if(plans.some(p=>p.old!==null)){
  fs.mkdirSync(path.join(root,'backups'),{recursive:true});backup=fs.mkdtempSync(path.join(root,'backups/vietnamese-font-data-'));
  for(const p of plans.filter(p=>p.old!==null))fs.writeFileSync(path.join(backup,p.name),p.old,{flag:'wx'});
 }
 for(const p of plans){fs.writeFileSync(p.file,p.text,{flag:p.old===null?'wx':'w'});assert.equal(fs.readFileSync(p.file,'utf8'),p.text);}
}
console.log(JSON.stringify({apply,filesToWrite:plans.map(p=>p.name),characters:Object.keys(output).length,vietnameseVowelAndDKeys:vietnamese.size,creeperAccentedKeys:Object.values(creeperLetters),excludedHelpers:skipped,textureKeys:Object.keys(textures.textures),backup},null,2));
