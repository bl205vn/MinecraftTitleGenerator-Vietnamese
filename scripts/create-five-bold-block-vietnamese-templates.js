// Create the seven new Block templates from the user's fixed 1000x320 atlas.
// No atlas edits, registry/build changes, or composed letters in this step.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {render,uv,pixel} from './five-offline-render.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const font=path.join(root,'fonts/minecraft-five-bold-block-vietnamese');
const apply=process.argv.includes('--apply');assert.ok(process.argv.slice(2).every(a=>a==='--apply'));
const hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex'),inputs=new Map();
for(const sub of ['characters','textures','overlays'])if(fs.existsSync(path.join(font,sub)))for(const n of fs.readdirSync(path.join(font,sub))){const f=path.join(font,sub,n);if(fs.statSync(f).isFile())inputs.set(f,hash(f));}
const {data:atlas,info}=await sharp(path.join(font,'textures/flat.png')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
assert.deepEqual([info.width,info.height],[1000,320]);
const px=(a,b,c,d)=>[a/62.5,b/20,c/62.5,d/20];
const specs=[['đ',294,42],['ư',338,42],['ơ',382,42],['grave',426,18],['acute',446,18],['hookabove',466,24],['breve',492,30]];
const plans=specs.map(([name,x,w])=>{
 const y=164,face=u=>({uv:u,texture:'#0'}),e={from:[8-w/2,2,0],to:[8+w/2,50,16],faces:{north:face(px(x,y+16,x+w,y+64)),south:face(px(x+w,y+16,x,y+64)),up:face(px(x+w,y+16,x,y)),down:face(px(x+w,y+80,x,y+64))}};
 const model={credit:'By Ewan Howell & bl205vn',texture_size:[1000,320],textures:{'0':'minecraft-five-bold-block-vietnamese:flat'},elements:[e]};
 const file=path.join(font,'characters',name+'.json');if(fs.existsSync(file))assert.deepEqual(JSON.parse(fs.readFileSync(file)),model,'Refusing to overwrite edited '+name);
 for(let j=y;j<y+80;j++)for(let i=x;i<x+w;i++)assert.equal(atlas[(j*1000+i)*4+3],255,name+' non-opaque panel');
 // Inspect every texel through actual model UVs, including the mirrored back.
 let sampled=0;for(let yy=2;yy<50;yy++)for(let xx=e.from[0];xx<e.to[0];xx++){
  const front=pixel(...uv(e,'north',[xx+.5,yy+.5,8]),atlas),back=pixel(...uv(e,'south',[xx+.5,yy+.5,8]),atlas);
  assert.deepEqual(front,back,name+' front/back mismatch');
  const tx=x+e.to[0]-xx-1,ty=y+16+e.to[1]-yy-1,at=(ty*1000+tx)*4;
  assert.deepEqual(front,atlas.subarray(at,at+4),name+' front texel mapping');sampled++;
 }
 for(const side of ['up','down'])for(let xx=e.from[0];xx<e.to[0];xx++)for(let z=0;z<16;z++)assert.deepEqual([...pixel(...uv(e,side,[xx+.5,side==='up'?50:2,z+.5]),atlas)],side==='up'?[176,176,176,255]:[84,84,84,255],name+' cap '+side);
 return{name,model,file,atlasCell:[x,y,w,80],front:[x,y+16,w,48],sampled,cubes:1};
});
// These already exist and must stay at the user's declared coordinates.
for(const[name,box]of [['^',[932,98,956,146]],['~',[262,180,292,228]],['.',[742,98,754,146]]]){
 const m=JSON.parse(fs.readFileSync(path.join(font,'characters',name+'.json')));assert.deepEqual(m.elements[0].faces.north.uv.map((v,i)=>Math.round(v*(i%2?20:62.5))),box,'Existing '+name+' UV changed');
}
for(const[f,h]of inputs)assert.equal(hash(f),h,'Protected input changed '+f);
const review=fs.mkdtempSync(path.join(root,'backups/block-vietnamese-templates-'));
fs.writeFileSync(path.join(review,'input-hashes.json'),JSON.stringify(Object.fromEntries(inputs),null,2));
const layers=[],size=150;for(const[i,p]of plans.entries())for(const[j,d]of [[0,[0,0,1]],[1,[.5,-.7,1]],[2,[.5,.7,1]],[3,[0,0,-1]]])layers.push({input:await render(p.model,d,size,atlas),left:j*size,top:i*175+25});
const height=plans.length*175+25,labels=Buffer.from(`<svg width="600" height="${height}"><g fill="white" font-family="Arial" font-size="14"><text x="5" y="18">FRONT</text><text x="155" y="18">ABOVE</text><text x="305" y="18">BELOW</text><text x="455" y="18">BACK</text>${plans.map((p,i)=>`<text x="5" y="${i*175+43}">${p.name}</text>`).join('')}</g></svg>`);layers.push({input:labels,left:0,top:0});
await sharp({create:{width:600,height,channels:4,background:'#1c1e23'}}).composite(layers).png().toFile(path.join(review,'preview.png'));
if(apply)for(const p of plans)if(!fs.existsSync(p.file))fs.writeFileSync(p.file,JSON.stringify(p.model,null,'\t')+'\n',{flag:'wx'});
for(const[f,h]of inputs)assert.equal(hash(f),h,'Existing input changed '+f);
if(apply)for(const p of plans)assert.deepEqual(JSON.parse(fs.readFileSync(p.file)),p.model,'Stored model mismatch');
const report={apply,newModels:plans.map(({name,atlasCell,front,sampled,cubes})=>({name,atlasCell,front,sampled,cubes})),existingModelsAndTexturesUnchanged:true,centerXZ:[8,8],baselineY:2,panelHeight:48,capDepth:16,reused:['^.json','~.json','..json'],guiVerified:false,review};
fs.writeFileSync(path.join(review,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'backups/block-vietnamese-templates-last.txt'),review);console.log(JSON.stringify(report,null,2));
