import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {Canvas, Image, ImageData, loadImage} from 'skia-canvas';
import getTHREE from 'node-three';
import createGL from 'gl';
import sharp from 'sharp';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fs.readFileSync(path.join(root,'plugin/minecraft_title_generator.js'),'utf8');
const registry=JSON.parse(fs.readFileSync(path.join(root,'fonts.json')));
const review=fs.readFileSync(path.join(root,'backups/vietnamese-example-spacing-last.txt'),'utf8').trim();
const {THREE,loadTexture}=await getTHREE({Canvas,Image,ImageData,fetch,Request,Response,Headers});
function extract(name){const begin=source.search(new RegExp('^  (?:async )?function '+name+'\\(', 'm'));assert.ok(begin>=0,name);const rest=source.slice(begin),match=rest.slice(rest.indexOf('\n')+1).search(/^  (?:async )?function |^  const |^\}\)\(\);/m);return match<0?rest:rest.slice(0,rest.indexOf('\n')+1+match);}
const preview=source.match(/            async makePreview\(\) \{[\s\S]*?\n            \},\r?\n            updatePreview/)[0].replace(/,\r?\n            updatePreview$/,'');
const fonts={};for(const parent of registry)for(const v of parent.variants??[])if(v.id.endsWith('-vietnamese'))fonts[v.id]={height:44,textureWidth:1000,textureHeight:320,type:'font',...parent,...v,characters:JSON.parse(fs.readFileSync(path.join(root,'fonts',v.id,'characters.json')))};
const made=[];
class Group{constructor(name){this.name=name;this.children=[];}addTo(parent){parent?.children?.push(this);return this;}init(){return this;}}
class Cube{constructor(e){Object.assign(this,structuredClone(e));this.faces=Object.fromEntries(['north','south','up','down','east','west'].map(s=>[s,structuredClone(e.faces[s]??{uv:[0,0,0,0]})]));made.push(this);}addTo(parent){parent.children.push(this);return this;}init(){return this;}}
let renders=0;
const context=vm.createContext({console,structuredClone,fonts,Group,Cube,charMap:{},makeName:s=>s.toLowerCase(),Math:Object.assign(Object.create(Math),{degToRad:n=>n*Math.PI/180}),THREE:{...THREE,WebGLRenderer:class{render(){renders++;}}},getFontCharacters:async()=>{},getArgs:v=>({font:v.font}),makeTexture:async({font})=>{const image=await loadImage(path.join(root,'fonts',font,'textures/flat.png'));const canvas=new Canvas(image.width,image.height);canvas.getContext('2d').drawImage(image,0,0);const texture=await loadTexture(canvas);texture.flipY=true;texture.magFilter=texture.minFilter=THREE.NearestFilter;return texture;}});
vm.runInContext(['prepareFontText','getTopBottomSpacing','fitTitleExampleCamera','makeCharacter'].map(extract).join('\n')+'\nthis.makePreview=({'+preview+'}).makePreview;this.prepare=prepareFontText;this.spacing=getTopBottomSpacing;this.character=makeCharacter;',context);
const reports=[];
for(const [id,font]of Object.entries(fonts)){
 assert.deepEqual(font.example,['VĂN BẢN','VÍ DỤ']);
 assert.equal(context.prepare(font.example[0],id),'vĂn bẢn');
 assert.equal(context.prepare(font.example[1],id),'ví dụ');
 if(font.bakedPanels){assert.equal(context.spacing(font,{topBottomSpacing:80}),0);continue;}
 const vue={font:id,scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(18,2,1,1000),topBottomSpacing:font.topBottomSpacing};
 await context.makePreview.call(vue);assert.equal(vue.scene.children.length,2);
 const top=new THREE.Box3().setFromObject(vue.scene.children[0]),bottom=new THREE.Box3().setFromObject(vue.scene.children[1]);
 assert.ok(bottom.min.z>top.max.z,id+' preview overlap');
 const z=vue.scene.children[1].position.z;vue.topBottomSpacing+=20;await context.makePreview.call(vue);assert.ok(Math.abs(vue.scene.children[1].position.z-z-15)<1e-8);
 vue.topBottomSpacing=font.topBottomSpacing;await context.makePreview.call(vue);
 // Real insertion uses the same gap at row 0; audit every compiled mark, not just the example.
 const bounds={};for(const type of ['top','bottom']){
   const start=made.length,parent=new Group(type);let offset=0;
   for(const ch of Object.keys(font.characters)){const result=context.character(ch,offset,parent,{font:id,type,row:0,rowSpacing:0,scale:[1,1,1],elements:[],texture:'flat',topBottomSpacing:font.topBottomSpacing},2);offset=result[1];}
   const cubes=made.slice(start);bounds[type]=new THREE.Box3();
   for(const e of cubes)for(const x of [e.from[0],e.to[0]])for(const y of [e.from[1],e.to[1]])for(const z of [e.from[2],e.to[2]])bounds[type].expandByPoint(new THREE.Vector3(x,type==='bottom'?z:y,type==='bottom'?-y:z));
 }
 assert.ok(bounds.bottom.min.z>bounds.top.max.z,id+' output overlap');
 const placement=gap=>{const start=made.length;context.character('í',0,new Group('control'),{font:id,type:'bottom',row:0,rowSpacing:0,scale:[1,1,1],elements:[],texture:'flat',topBottomSpacing:gap},2);return made.slice(start).map(e=>({from:e.from,to:e.to}));};
 const base=placement(0),spaced=placement(80);for(let i=0;i<base.length;i++)for(const key of ['from','to'])assert.ok(Math.abs(base[i][key][1]-spaced[i][key][1]-60)<1e-8,'row 0 spacing must move actual Bottom cubes');
 const control={...font};delete control.topBottomSpacing;context.fonts.control=control;
 const nativePlacement=gap=>{const start=made.length;context.character('a',0,new Group('native'),{font:'control',type:'bottom',row:0,rowSpacing:0,scale:[1,1,1],elements:[],texture:'flat',topBottomSpacing:gap},2);return made.slice(start).map(e=>({from:e.from,to:e.to}));};
 assert.deepEqual(nativePlacement(0),nativePlacement(80));delete context.fonts.control;
 // Fit check in projected space for the new two-line example.
 vue.scene.updateMatrixWorld(true);for(const child of vue.scene.children){const b=new THREE.Box3().setFromObject(child);for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z]){const p=new THREE.Vector3(x,y,z).project(vue.camera);assert.ok(Math.abs(p.x)<1&&Math.abs(p.y)<1,id+' preview clipped');}}
 const W=1000,H=500,gl=createGL(W,H);assert.ok(gl);const renderer=new THREE.WebGLRenderer({context:gl}),target=new THREE.WebGLRenderTarget(W,H);renderer.setSize(W,H,false);renderer.setRenderTarget(target);renderer.render(vue.scene,vue.camera);const bytes=Buffer.alloc(W*H*4);gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,bytes);assert.ok(bytes.some((v,i)=>i%4===3&&v));await sharp(bytes,{raw:{width:W,height:H,channels:4}}).flip().png().toFile(path.join(review,id+'-example.png'));gl.getExtension('STACKGL_destroy_context').destroy();
 const elements=[],groups=[],outliner=[];
 for(const [index,text]of font.example.entries()){
   const type=index?'bottom':'top',start=made.length,parent=new Group(type);let offset=0;
   for(const ch of context.prepare(text,id)){if(ch===' '&&!font.characters[ch]){offset+=font.spaceWidth??8;continue;}const result=context.character(ch,offset,parent,{font:id,type,row:0,rowSpacing:0,scale:[1,1,1],elements:[],texture:'flat',topBottomSpacing:font.topBottomSpacing},2);offset=result[1];}
   const cubes=made.slice(start),lo=Math.min(...cubes.flatMap(e=>[e.from[0],e.to[0]])),hi=Math.max(...cubes.flatMap(e=>[e.from[0],e.to[0]])),children=[],groupId=id+'-'+type;
   for(const e of cubes){for(const key of ['from','to'])e[key][0]-=(lo+hi)/2;const uuid=id+'-'+elements.length;children.push(uuid);elements.push({...e,type:'cube',uuid,name:'cube',box_uv:false,autouv:0,origin:[0,0,0],faces:Object.fromEntries(Object.entries(e.faces).map(([side,f])=>[side,{...f,texture:f.texture===null?null:0}]))});}
   groups.push({name:text,uuid:groupId,origin:[0,0,0],rotation:index?[-90,0,0]:[0,0,0],visibility:true,export:true});outliner.push({uuid:groupId,children});
 }
 const image=await loadImage(path.join(root,'fonts',id,'textures/flat.png')),atlas=new Canvas(image.width,image.height);atlas.getContext('2d').drawImage(image,0,0);const png=await atlas.toBuffer('png');
 fs.writeFileSync(path.join(review,id+'-example.bbmodel'),JSON.stringify({meta:{format_version:'5.0',model_format:'minecraft_title',box_uv:false},name:'Vietnamese example',resolution:{width:1000,height:320},elements,groups,outliner,textures:[{name:'flat.png',uuid:'flat',id:'0',width:1000,height:320,uv_width:1000,uv_height:320,render_mode:'default',render_sides:'front',source:'data:image/png;base64,'+png.toString('base64')}]}));
 reports.push({font:id,previewGap:bottom.min.z-top.max.z,outputGap:bounds.bottom.min.z-bounds.top.max.z,allCharacters:Object.keys(font.characters).length});
 console.log('PASS '+id, reports.at(-1));
}
assert.equal(context.spacing({height:44},{topBottomSpacing:80}),0);
fs.writeFileSync(path.join(review,'report.json'),JSON.stringify({reports,renders,guiVerified:false},null,2));
console.log('Review: '+review);
