import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {Canvas,Image,ImageData,loadImage} from 'skia-canvas';
import getTHREE from 'node-three';
import createGL from 'gl';
import sharp from 'sharp';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const pointer=path.join(root,'backups/legacy-layout-review-last.txt');
const review=fs.readFileSync(pointer,'utf8').trim();
const source=fs.readFileSync(path.join(root,'plugin/minecraft_title_generator.js'),'utf8');
const upstream=fs.readFileSync(path.join(review,'upstream-plugin.js'),'utf8');
const registry=JSON.parse(fs.readFileSync(path.join(root,'fonts.json')));
const {THREE,loadTexture}=await getTHREE({Canvas,Image,ImageData,fetch,Request,Response,Headers});
function extract(text,name){const begin=text.search(new RegExp('^  (?:async )?function '+name+'\\(', 'm'));assert.ok(begin>=0,name);const rest=text.slice(begin),end=rest.slice(rest.indexOf('\n')+1).search(/^  (?:async )?function |^  const |^\}\)\(\);/m);return end<0?rest:rest.slice(0,rest.indexOf('\n')+1+end);}
function previewMethod(text){return text.match(/            async makePreview\(\) \{[\s\S]*?\n            \},?\r?\n            updatePreview/)[0].replace(/,?\r?\n            updatePreview$/,'');}
const fonts={};for(const parent of registry)for(const variant of parent.variants??[])if(variant.smallMainSpacing!==undefined)fonts[variant.id]={height:44,textureWidth:1000,textureHeight:320,type:'font',...parent,...variant,characters:JSON.parse(fs.readFileSync(path.join(root,'fonts',variant.id,'characters.json')))};
function makeContext(text,records,isLegacy=false){
 class Group{static all=[];static multi_selected=[];constructor(name){this.name=name;this.children=[];this.rotation=[0,0,0];this.origin=[0,0,0];this.uuid=randomUUID();Group.all.push(this);}addTo(parent){Object.defineProperty(this,'parent',{value:parent,writable:true,configurable:true,enumerable:false});parent?.children?.push(this);return this;}init(){return this;}select(){Group.multi_selected=[this];const collect=node=>node instanceof Cube?[node]:node.children.flatMap(collect);Cube.selected=collect(this);return this;}}
 class Cube{static selected=[];static all=[];constructor(e){Cube.all.push(this);Object.assign(this,structuredClone(e));this.uuid=randomUUID();this.faces=Object.fromEntries(['north','south','up','down','east','west'].map(s=>[s,structuredClone(e.faces?.[s]??{uv:[0,0,0,0]})]));}get mesh(){const g=new THREE.BoxGeometry(...this.to.map((n,i)=>n-this.from[i])),mesh=new THREE.Mesh(g);mesh.position.fromArray(this.from.map((n,i)=>(n+this.to[i])/2));let p=this.parent;while(p&&typeof p==='object'){const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(...p.rotation.map(n=>n*Math.PI/180)));mesh.position.applyQuaternion(q);mesh.quaternion.premultiply(q);p=p.parent;}return mesh;}addTo(parent){Object.defineProperty(this,'parent',{value:parent,writable:true,configurable:true,enumerable:false});parent.children.push(this);return this;}init(){return this;}}
 class Texture{static all=[];}
 const ctx=vm.createContext({console,structuredClone,fonts:structuredClone(fonts),Cube,Group,Texture,charMap:{'┫':'open_terminator','┣':'close_terminator',' ':'space','\u200b':'spacer'},makeName:s=>s.toLowerCase(),Math:Object.assign(Object.create(Math),{degToRad:n=>n*Math.PI/180}),THREE:{...THREE,WebGLRenderer:class{render(){}dispose(){}}},Undo:{initEdit(r){records.elements=r.elements;},finishEdit(){}},Canvas:{updateView(){}},updateSelection(){},sendStats(){throw Error('Unexpected telemetry');},getFontCharacters:async()=>{},getArgs:(vue,three)=>({font:vue.font,three}),makeTexture:async args=>{
   if(!args.three)return{uuid:randomUUID(),img:{src:args.font},add(){}};
   const image=await loadImage(path.join(root,'fonts',args.font,'textures/flat.png')),canvas=new Canvas(image.width,image.height);canvas.getContext('2d').drawImage(image,0,0);const texture=await loadTexture(canvas);texture.flipY=true;texture.magFilter=texture.minFilter=THREE.NearestFilter;return texture;
 }});
 const helpers=isLegacy?[]:['getTopBottomSpacing','getSmallTitleOffsets','fitTitleExampleCamera','prepareFontText'];
 vm.runInContext(helpers.concat(['makeCharacter','makeWord','addText']).map(name=>extract(text,name)).join('\n')+'\nthis.preview=({'+previewMethod(text)+'}).makePreview;this.add=addText;'+(isLegacy?'':'this.prepare=prepareFontText;this.offsets=getSmallTitleOffsets;'),ctx);
 return ctx;
}
const records={},oldRecords={},current=makeContext(source,records),legacy=makeContext(upstream,oldRecords,true);
const defaults={row:0,rowSpacing:0,characterSpacing:0,spacerWidth:0,scaleX:1,scaleY:1,scaleZ:1,ignoreStats:true,ignoreTextureCheck:true,terminators:false};
async function insert(ctx,record,id,text,type,extra={}){
 await ctx.add(text,{...defaults,font:id,type,...extra});
 const cubes=Array.from(record.elements);assert.ok(cubes.length);assert.ok(cubes.every(e=>[...e.from,...e.to].every(Number.isFinite)));
 const group=ctx.Group.multi_selected[0],box=new THREE.Box3();
 for(const e of cubes)for(const x of [e.from[0],e.to[0]])for(const y of [e.from[1],e.to[1]])for(const z of [e.from[2],e.to[2]])box.expandByPoint(new THREE.Vector3(x,type==='bottom'?z:y,type==='bottom'?-y:z));
 return{cubes,group,box};
}
async function renderPreview(scene,camera,file){
 const W=1000,H=500,gl=createGL(W,H);assert.ok(gl);const renderer=new THREE.WebGLRenderer({context:gl}),target=new THREE.WebGLRenderTarget(W,H);renderer.setSize(W,H,false);renderer.setRenderTarget(target);renderer.render(scene,camera);const pixels=Buffer.alloc(W*H*4);gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,pixels);assert.ok(pixels.some((n,i)=>i%4===3&&n));await sharp(pixels,{raw:{width:W,height:H,channels:4}}).flip().png().toFile(file);gl.getExtension('STACKGL_destroy_context').destroy();
}
const reset=ctx=>{ctx.Cube.all.length=0;ctx.Cube.selected=[];ctx.Group.all.length=0;ctx.Group.multi_selected=[];};
const reports=[];
for(const [id,font]of Object.entries(fonts)){
 const inputs=['vĂn bẢn','ví dụ','mới','ẳ ậ ự','minecraft'];
 let centered=0;
 for(const text of inputs)for(const type of ['top','bottom','small'])for(const scaleX of [1,.7,1.5]){
   reset(current);const r=await insert(current,records,id,text,type,{scaleX,characterSpacing:2});
   assert.ok(Math.abs((r.box.min.x+r.box.max.x)/2)<1e-8,id+'/'+type+' not centered');centered++;
 }
 // The underlying legacy transforms and UVs remain exact when corrections are disabled.
 // Keep an existing Top unchanged while creating and centering Small.
 reset(current);const existingTop=await insert(current,records,id,'vĂn bẢn','top');const topPositions=JSON.stringify(existingTop.cubes.map(e=>[e.from,e.to]));await insert(current,records,id,'ví dụ','small');assert.equal(JSON.stringify(existingTop.cubes.map(e=>[e.from,e.to])),topPositions);
 const liveFont=current.fonts[id],saved={smallMainSpacing:liveFont.smallMainSpacing,smallDepthSpacing:liveFont.smallDepthSpacing,topBottomSpacing:liveFont.topBottomSpacing};
 delete liveFont.smallMainSpacing;delete liveFont.smallDepthSpacing;delete liveFont.topBottomSpacing;
 for(const type of ['top','bottom','small']){
   const a=await insert(current,records,id,'vĂn bẢn',type),b=await insert(legacy,oldRecords,id,'vĂn bẢn',type);
   const shape=cubes=>JSON.stringify(cubes.map(e=>({from:e.from,to:e.to,faces:Object.fromEntries(Object.entries(e.faces).map(([side,f])=>[side,{uv:f.uv,texture:f.texture===null?null:'atlas'}]))})));assert.ok(shape(a.cubes)===shape(b.cubes),id+'/'+type+' legacy mismatch');
 }
 Object.assign(liveFont,saved);
 // Full-font clearance, including inverted borders, all accent variants and Creeper.
 reset(current);const all=Object.keys(font.characters).join(''),top=await insert(current,records,id,all,'top'),bottom=await insert(current,records,id,all,'bottom'),small=await insert(current,records,id,all,'small');
 assert.ok(small.box.max.y<top.box.min.y,id+' Small hits Top');assert.ok(small.box.max.z<bottom.box.min.z,id+' Small hits Bottom');
 const bottomZero=await insert(current,records,id,all,'bottom',{topBottomSpacing:0}),smallZero=await insert(current,records,id,all,'small',{topBottomSpacing:0});assert.ok(smallZero.box.max.z<bottomZero.box.min.z,id+' Small Z must adapt to Bottom gap');
 const marked=current.offsets(liveFont,{layoutText:'ví dụ',topBottomSpacing:80}),plain=current.offsets(liveFont,{layoutText:'minecraft',topBottomSpacing:80});assert.ok(marked.y>=plain.y);assert.ok(marked.y<44,'Small correction must be smaller than the rejected constant');
 // Compare the actual preview meshes against the original renderer, with the same Vietnamese keys.
 const vue={font:id,type:'top',topBottomSpacing:80,scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(18,2,1,1000)};
 const oldVue={...vue,scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(18,2,1,1000)};oldVue.camera.position.set(0,-170,-320);oldVue.camera.lookAt(new THREE.Vector3());
 legacy.fonts[id].example=font.example.map(t=>current.prepare(t,id));
 await current.preview.call(vue);await legacy.preview.call(oldVue);
 assert.equal(vue.scene.children.length,2);assert.equal(oldVue.scene.children.length,2);
 for(let i=0;i<2;i++){
   const a=vue.scene.children[i],b=oldVue.scene.children[i];assert.equal(a.children.length,b.children.length);assert.deepEqual(a.scale.toArray(),b.scale.toArray());assert.deepEqual(a.rotation.toArray(),b.rotation.toArray());
   assert.equal(a.position.x,b.position.x);assert.equal(a.position.y,b.position.y);
   for(let j=0;j<a.children.length;j++)for(let k=0;k<a.children[j].children.length;k++){
     const x=a.children[j].children[k],y=b.children[j].children[k];assert.deepEqual(x.position.toArray(),y.position.toArray());assert.deepEqual(Array.from(x.geometry.attributes.position.array),Array.from(y.geometry.attributes.position.array));
   }
 }
 const oldTop=new THREE.Box3().setFromObject(oldVue.scene.children[0]),oldBottom=new THREE.Box3().setFromObject(oldVue.scene.children[1]);
 const correction=Math.max(0,oldTop.max.z+2-oldBottom.min.z);assert.ok(Math.abs(vue.scene.children[1].position.z-oldVue.scene.children[1].position.z-correction)<1e-8);
 assert.equal(vue.camera.fov,18);assert.ok(vue.camera.position.length()>=Math.hypot(170,320)-1e-8);
 for(const type of ['small','bottom','top']){vue.type=type;await current.preview.call(vue);assert.equal(vue.scene.children.length,2);}
 vue.scene.updateMatrixWorld(true);vue.camera.updateMatrixWorld(true);
 for(const child of vue.scene.children){const box=new THREE.Box3().setFromObject(child);for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){const p=new THREE.Vector3(x,y,z).project(vue.camera);assert.ok(Math.abs(p.x)<1&&Math.abs(p.y)<1,id+' preview clips Vietnamese marks '+JSON.stringify(p));}}
 await renderPreview(vue.scene,vue.camera,path.join(review,id+'-example.png'));
 await renderPreview(oldVue.scene,oldVue.camera,path.join(review,id+'-legacy-example.png'));
 // Export placements produced by addText itself, without manually re-centering the test output.
 reset(current);const elements=[],groups=[],outliner=[];
 for(const [type,text]of [['top',font.example[0]],['bottom',font.example[1]],['small',font.example[1]]]){
   const result=await insert(current,records,id,current.prepare(text,id),type),uuid=randomUUID(),children=[];
   for(const e of result.cubes){const key=randomUUID();children.push(key);elements.push({...e,uuid:key,type:'cube',name:'cube',origin:[0,0,0],box_uv:false,faces:Object.fromEntries(Object.entries(e.faces).map(([side,f])=>[side,{...f,texture:f.texture===null?null:0}]))});}
   groups.push({uuid,name:type+' '+text,origin:[0,0,0],rotation:Array.from(result.group.rotation),visibility:true,export:true});outliner.push({uuid,children});
 }
 const tagged=current.offsets(liveFont,{font:id,layoutText:'ví dụ',topBottomSpacing:80});
 for(const group of current.Group.all)delete group._minecraftTitleLayout;
 const reopened=current.offsets(liveFont,{font:id,layoutText:'ví dụ',topBottomSpacing:80});assert.equal(JSON.stringify(tagged),JSON.stringify(reopened),id+' existing untagged models must keep the same clearance');
 const image=await loadImage(path.join(root,'fonts',id,'textures/flat.png')),canvas=new Canvas(image.width,image.height);canvas.getContext('2d').drawImage(image,0,0);const png=await canvas.toBuffer('png');
 fs.writeFileSync(path.join(review,id+'-example.bbmodel'),JSON.stringify({meta:{format_version:'5.0',model_format:'minecraft_title',box_uv:false},name:'Legacy layout comparison',resolution:{width:1000,height:320},elements,groups,outliner,textures:[{name:'flat.png',id:'0',uuid:'flat',width:1000,height:320,uv_width:1000,uv_height:320,render_sides:'front',render_mode:'default',source:'data:image/png;base64,'+png.toString('base64')}]}));
 reports.push({font:id,centeredCases:centered,smallOffsets:current.offsets(liveFont,{font:id,layoutText:'ví dụ',topBottomSpacing:80}),worstFontOffsets:marked,plainOffsets:plain,previewCorrection:correction,smallTopGap:top.box.min.y-small.box.max.y,smallBottomGap:bottom.box.min.z-small.box.max.z});console.log('PASS',reports.at(-1));
}
fs.writeFileSync(path.join(review,'report.json'),JSON.stringify({reports,upstreamSHA256:createHash('sha256').update(upstream).digest('hex'),actualAddTextExecuted:true,guiVerified:false},null,2));
console.log('Review: '+review);
