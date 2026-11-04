import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {Canvas as SkiaCanvas,Image,ImageData,loadImage} from 'skia-canvas';
import getTHREE from 'node-three';
import sharp from 'sharp';
import createGL from 'gl';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),fontId='minecraft-five-bold-block-vietnamese',fontDir=path.join(root,'fonts',fontId),source=fs.readFileSync(path.join(root,'plugin/minecraft_title_generator.js'),'utf8');
fs.mkdirSync(path.join(root,'backups'),{recursive:true});
const review=fs.mkdtempSync(path.join(root,'backups/block-plugin-integration-test-'));fs.mkdirSync(path.join(review,'outputs'));
const hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex'),protectedFiles=new Map();for(const sub of ['characters','textures','overlays'])for(const n of fs.readdirSync(path.join(fontDir,sub))){const f=path.join(fontDir,sub,n);if(fs.statSync(f).isFile())protectedFiles.set(f,hash(f));}
const parent=JSON.parse(fs.readFileSync(path.join(root,'fonts.json'))).find(f=>f.id==='minecraft-five-bold-block'),variant=parent.variants.find(f=>f.id===fontId),font={...parent,...variant,textureWidth:1000,textureHeight:320,type:'font',characters:JSON.parse(fs.readFileSync(path.join(fontDir,'characters.json')))};delete font.variants;
const meta=JSON.parse(fs.readFileSync(path.join(fontDir,'textures.json')));font.textures=meta.textures;font.overlays=meta.overlays;
function extract(name){const begin=source.search(new RegExp('^  (?:async )?function '+name+'\\(', 'm'));assert.ok(begin>=0,name);const rest=source.slice(begin),match=rest.slice(rest.indexOf('\n')+1).search(/^  (?:async )?function |^  const |^\}\)\(\);/m);return match<0?rest:rest.slice(0,rest.indexOf('\n')+1+match);}
class Frame{constructor(w,h){this.width=w;this.height=h;this.canvas=new SkiaCanvas(w,h);this.canvas.toDataURL=()=>this.canvas.toDataURLSync('png');this.ctx=this.canvas.getContext('2d');}}
const made=[],groups=[];class Group{static multi_selected=[];constructor(name){this.name=name;this.children=[];this.rotation=[0,0,0];this.uuid=randomUUID();groups.push(this);}addTo(parent){if(parent?.children)parent.children.push(this);return this;}init(){return this;}select(){Group.multi_selected=[this];return this;}}
class Cube{constructor(e){Object.assign(this,structuredClone(e));this.uuid=randomUUID();made.push(this);}addTo(parent){parent.children.push(this);return this;}init(){return this;}}
class Texture{static all=[];constructor(o){Object.assign(this,o);this.uuid=randomUUID();}fromDataURL(data){this.img={src:data};return this;}add(){Texture.all.push(this);return this;}}
const defaults={font:fontId,texture:'flat',variant:null,type:'top',row:0,rowSpacing:0,characterSpacing:0,scaleX:1,scaleY:1,scaleZ:1,spacerWidth:0,ignoreStats:true,overlay:'none',hue:0,saturation:100,brightness:100,contrast:100,blend:'multiply',colour:'#fff',colourOpacity:100,edgeBrightness:35,gradientColour0:null,tileableScale:2,tileableXOffset:0,tileableYOffset:0,tileableTextureResolution:1,tileableRandomRotations:false,tileableRandomMirroring:false,overlayBlend:'overlay',overlayColourBlend:'multiply',overlayColour:'#fff',overlayOpacity:100};
const pattern=new SkiaCanvas(16,16),pctx=pattern.getContext('2d');pctx.fillStyle='#00ff80';pctx.fillRect(0,0,16,16);pctx.fillStyle='#0040ff';pctx.fillRect(3,2,5,7);await pattern.saveAs(path.join(review,'pattern.png'));
let customFuture;const getTexture=async(object,id,variant,direct)=>direct?path.join(root,direct):id==='future_test'?customFuture:path.join(fontDir,object===font.overlays?'overlays':'textures',(variant??id)+'.png');
const math=Object.assign(Object.create(Math),{lerp:(a,b,t)=>a+(b-a)*t,degToRad:n=>n*Math.PI/180});
const context={console,structuredClone,Math:math,CanvasFrame:Frame,fonts:{[fontId]:font},loadImage,getTexture,getFontCharacters:async()=>{},getTileable:async()=>path.join(review,'pattern.png'),Texture,Group,Cube,Undo:{initEdit(){},finishEdit(){}},Canvas:{updateView(){}},updateSelection(){},sendStats(){throw Error('Unexpected telemetry in test');},charMap:{'┫':'open_terminator','┣':'close_terminator',' ':'space','\u200b':'spacer'},makeName:s=>s.toLowerCase(),getArgs:v=>({...defaults,...v})};
vm.createContext(context);const core=source.slice(source.indexOf('  // BEGIN BAKED BLOCK PANELS'),source.indexOf('  // END BAKED BLOCK PANELS'));
const stop=source.slice(source.indexOf('  const stopConfigs ='),source.indexOf('  const titleCameraAngle'));
vm.runInContext(core+'\n'+extract('fitTitleExampleCamera')+'\n'+extract('makeTexture')+'\n'+extract('clipFontCapRegions')+'\n'+extract('collectTileableUVRegions')+'\n'+extract('loadOverlay')+'\n'+extract('drawRotatedMirrored')+'\nconst fract=n=>n-Math.floor(n);\n'+extract('random')+'\n'+extract('prepareFontText')+'\n'+stop+'\nthis.api={bakeBlockPanels,bakedBlockInstances,prepareBakedBlock,addBakedBlockText,makeTexture,collectTileableUVRegions,makeBakedBlockPreview,queueBakedBlockPreview};',context);
const api=context.api,results=[];const args=o=>({...defaults,...o});
const flatImage=await loadImage(path.join(fontDir,'textures/flat.png')),mask=new Frame(1000,320);mask.ctx.drawImage(flatImage,0,0);font.bakedMask=mask.canvas;
function log(name,detail={}){results.push({name,...detail});console.log('PASS '+name);}
function pixel(image,u,v){const x=Math.floor(u/16*image.width+1e-7),y=Math.floor(v/16*image.height+1e-7);return Array.from(image.data.subarray((y*image.width+x)*4,(y*image.width+x)*4+4));}
function uv(e,side,x,y,z=8){const t=[x,y,z].map((v,i)=>(v-e.from[i])/(e.to[i]-e.from[i]));const q=side==='north'?[1-t[0],1-t[1]]:side==='south'?[t[0],1-t[1]]:side==='up'?[t[0],t[2]]:side==='east'?[1-t[2],1-t[1]]:side==='west'?[t[2],1-t[1]]:[t[0],1-t[2]],f=e.faces[side].uv??e.faces[side];return[f[0]+q[0]*(f[2]-f[0]),f[1]+q[1]*(f[3]-f[1])];}
const presetNames=new Set(Object.entries(meta.textures).flatMap(([id,p])=>[id,...Object.keys(p.variants??{})]));
const styles=fs.readdirSync(path.join(fontDir,'textures')).filter(n=>n.endsWith('.png')&&presetNames.has(n.slice(0,-4))).map(n=>n.slice(0,-4)).filter((_,i)=>!process.argv.includes('--quick')||i===0);
const allText=Object.keys(font.characters).join('');let inkSamples=0;
for(const style of styles){const canvas=await api.makeTexture(args({texture:style,canvas:true})),baked=api.bakeBlockPanels(font,allText,args({debug:true}),canvas,mask.canvas);assert.equal(baked.models.size,Object.keys(font.characters).length);const image=canvas.getContext('2d').getImageData(0,0,1000,320),flat=mask.ctx.getImageData(0,0,1000,320),pages=baked.pages.map(p=>p.ctx.getImageData(0,0,p.width,p.height));
 for(const[ch,def]of baked.models){const e=def.elements[0];assert.equal(def.elements.length,1);for(const src of font.characters[ch])if(src.faces.north)for(let y=src.from[1];y<src.to[1];y++)for(let x=Math.ceil(src.from[0]);x<src.to[0];x++){const q=uv(src,'north',x+.25,y+.5),ink=pixel(flat,...q);if(ink.every(v=>v===255)){const expected=pixel(image,...q),got=pixel(pages[def.page],...uv(e,'north',x+.25,y+.5));assert.deepEqual(got,expected,style+'/'+ch+' ink pixel');inkSamples++;}}}

 // Check cross-panel continuity and complete original end-cap top/bottom UVs.
 for(const ch of ['┫','┣']){
   const original=font.characters[ch][0],out=baked.models.get(ch),e=out.elements[0],width=e.to[0]-e.from[0],height=e.to[1]-e.from[1];
   assert.equal(e.name,'cube');
   const middle=baked.models.get('m'),m=middle.elements[0];
   for(let y=0;y<height;y++){
     const x=ch==='┫'?width-1:0;
     const expected=pixel(pages[middle.page],...uv(m,'north',m.to[0]-.5,m.to[1]-y-.5));
     const actual=pixel(pages[out.page],...uv(e,'north',e.to[0]-x-.5,e.to[1]-y-.5));
     assert.deepEqual(actual,expected,style+'/'+ch+' background seam at row '+y);
     if(style.endsWith('_planks'))for(let xx=0;xx<width;xx++)assert.deepEqual(pixel(pages[out.page],...uv(e,'north',e.to[0]-xx-.5,e.to[1]-y-.5)),expected,style+' wood phase');
   }
   if(style.endsWith('_planks'))for(const side of ['east','west'])if(original.faces[side])
     for(let y=0;y<height;y++)for(let z=0;z<16;z++){
       const expected=pixel(pages[middle.page],...uv(m,'north',m.to[0]-.5,m.to[1]-y-.5));
       const actual=pixel(pages[out.page],...uv(e,side,side==='east'?e.to[0]:e.from[0],e.to[1]-y-.5,z+.5));
       assert.deepEqual(actual,expected,style+'/'+side+' side/front seam at '+y+','+z);
     }
   for(const side of ['up','down'])for(let z=0;z<16;z++)for(let x=0;x<width;x++){
     const worldX=original.from[0]+x+.5;
     const expected=pixel(image,...uv(original,side,worldX,original.from[1],z+.5));
     const actual=pixel(pages[out.page],...uv(e,side,worldX,e.from[1],z+.5));
     assert.deepEqual(actual,expected,style+'/'+ch+' '+side+' cap '+x+','+z);
   }
   if(style==='neon'){
     const x=ch==='┫'?0:width-1;
     for(const y of [0,Math.floor(height/2),height-1]){
       const color=pixel(pages[out.page],...uv(e,'north',e.to[0]-x-.5,e.to[1]-y-.5));
       assert.ok(color[0]>100&&color[2]>150,'Neon vertical frame must stay bright');
     }
   }
 }
 log('preset '+style,{characters:baked.models.size,pages:baked.pages.length});if(style==='acacia_planks'){for(const[i,p]of baked.pages.entries())await p.canvas.saveAs(path.join(review,'outputs',style+'-catalogue-'+i+'.png'));}}
for(const mode of ['top','bottom','small']){const prepared=await api.prepareBakedBlock('aẳặựẨ',args({type:mode}));assert.ok(prepared.text.startsWith('┫')&&prepared.text.endsWith('┣'));assert.equal(prepared.instances.filter(r=>r.char!==null).length,7);assert.equal(prepared.instances.filter(r=>r.char===null).length,1);const geometry=prepared.instances.filter(r=>r.char!==null).map(r=>r.cube);assert.equal(new Set(geometry.map(e=>e.from[1]+','+e.to[1])).size,1);log('dynamic row '+mode,{pages:prepared.baked.pages.length,panels:geometry.length});}
// Regression: Small row 0 needs the legacy base-height translation as well as scaling.
const smallInputs=['LOI CHUC','LỜI CHÚC TẾT BAO LA THÀNH SỰ THẬT, CHẲNG'];
const normalizeSmall=text=>vm.runInContext('prepareFontText('+JSON.stringify(text)+','+JSON.stringify(fontId)+')',context);
const smallCases=[];
for(const [index,input]of smallInputs.entries()){
 const text=normalizeSmall(input),p=await api.prepareBakedBlock(text,args({type:'small',texture:'live'}));
 const panels=p.instances.filter(r=>r.char!==null),all=p.instances.map(r=>r.cube),lo=Math.min(...all.flatMap(e=>[e.from[0],e.to[0]])),hi=Math.max(...all.flatMap(e=>[e.from[0],e.to[0]]));
 assert.ok(Math.abs(lo+hi)<1e-8,'Small must stay centered');
 for(const panel of panels){const e=panel.cube,original=p.baked.models.get(panel.char).elements[0];assert.ok(Math.max(e.from[1],e.to[1])<=-.35,'Small must be below the top origin even at row 0');assert.ok(Math.abs((e.to[0]-e.from[0])-(original.to[0]-original.from[0])*.35)<1e-8);assert.ok(Math.abs((e.to[2]-e.from[2])-3.5)<1e-8);assert.equal(JSON.stringify(e.faces),JSON.stringify(original.faces),'Placement must not alter UVs');}
 const next=await api.prepareBakedBlock(text,args({type:'small',texture:'live',row:1,rowSpacing:3}));const height=Math.max(font.height,p.baked.rowTop-p.baked.rowBottom+4);
 for(let j=0;j<panels.length;j++)assert.ok(Math.abs(panels[j].cube.from[1]-next.instances.filter(r=>r.char!==null)[j].cube.from[1]-height*.35-3)<1e-8,'Small row pitch regression');
 if(index===0){assert.equal(p.baked.rowBottom,2);assert.equal(p.baked.rowTop,50);assert.ok(Math.abs(panels[0].cube.from[1]+17.5)<1e-8);assert.ok(Math.abs(panels[0].cube.to[1]+.7)<1e-8);}
 smallCases.push({index,input,text,prepared:p});
 log('Small base translation '+(index?'long accented input':'plain input'),{range:[Math.min(...all.flatMap(e=>[e.from[1],e.to[1]])),Math.max(...all.flatMap(e=>[e.from[1],e.to[1]]))],pages:p.baked.pages.length});
}
const repeated=await api.prepareBakedBlock('aaaaa',args({}));assert.equal(repeated.baked.models.size,3);assert.equal(repeated.baked.pages.length,1);log('repeat glyph cache');
const plain=await api.prepareBakedBlock('abc',args({}));assert.equal(plain.baked.rowBottom,2);assert.equal(plain.baked.rowTop,50);log('plain row remains 48px');
const lower=await api.prepareBakedBlock('aạ',args({}));assert.equal(lower.baked.rowBottom,-6);assert.equal(lower.baked.rowTop,48);log('lower-only extension');
const tallest=await api.prepareBakedBlock('ẳẩểổặ',args({}));assert.equal(tallest.baked.rowBottom,-6);assert.equal(tallest.baked.rowTop,82);assert.equal(tallest.baked.rowTop-tallest.baked.rowBottom,88);log('highest marks and dot share an 88px row');
const spacing=await api.prepareBakedBlock('aẳ',args({characterSpacing:4}));assert.ok(spacing.text.includes('\u200b'));assert.equal(spacing.args.characterSpacing,0);log('spacer expansion');
for(const ch of ['┫','┣']){const prepared=await api.prepareBakedBlock(ch,args({debug:true})),e=prepared.baked.models.get(ch).elements[0];assert.ok(e.faces[ch==='┫'?'east':'west']);}log('terminator side faces');
const fx=new Frame(1000,320);fx.ctx.drawImage(flatImage,0,0);const fd=fx.ctx.getImageData(0,0,1000,320);for(let y=0;y<320;y++)for(let x=0;x<1000;x++){const k=(y*1000+x)*4;if(fd.data[k+3])fd.data.set([(x*19+y*7)%256,(x*3+y*13)%256,(x*11+y*5)%256,255],k);}fx.ctx.putImageData(fd,0,0);customFuture=path.join(review,'future-test-atlas.png');await fx.canvas.saveAs(customFuture);
font.textures.future_test={author:'test only'};const future=await api.prepareBakedBlock('aẳặựẨ',args({texture:'future_test'}));assert.equal(future.baked.pages.length,1);await future.baked.pages[0].canvas.saveAs(path.join(review,'outputs/future-output.png'));log('new texture without palette code changes');
const custom=await api.prepareBakedBlock('aẳ',args({customTexture:customFuture,customTextureType:'texture'}));assert.equal(custom.baked.pages.length,1);log('custom atlas upload');
for(const scale of [2,4]){const hi=new Frame(1000*scale,320*scale);hi.ctx.imageSmoothingEnabled=false;hi.ctx.drawImage(flatImage,0,0,hi.width,hi.height);const file=path.join(review,'scaled-'+scale+'.png');await hi.canvas.saveAs(file);const hiPrepared=await api.prepareBakedBlock('aẳ',args({customTexture:file,customTextureType:'texture'}));assert.equal(hiPrepared.baked.pages[0].width,1000*scale);log('high resolution '+scale+'x');}
for(const smoothGradient of [true,false]){const r=await api.prepareBakedBlock('aẳặ',args({gradientColour0:'#ff4000',gradientColour4:'#0040ff',smoothGradient}));assert.ok(r.baked.pages[0].width>=1000);await r.baked.pages[0].canvas.saveAs(path.join(review,'outputs/gradient-'+smoothGradient+'.png'));log('gradient '+smoothGradient);}
for(const randomize of [false,true]){const r=await api.prepareBakedBlock('aẳặ',args({tileable:'test',tileableRandomRotations:randomize,tileableRandomMirroring:randomize}));await r.baked.pages[0].canvas.saveAs(path.join(review,'outputs/tileable-'+randomize+'.png'));log('tileable '+randomize);}
for(const overlay of Object.keys(font.overlays)){await api.prepareBakedBlock('aẳ',args({overlay}));log('overlay '+overlay);}
for(const extra of [{customBorder:true,customBorderColour:'#abcdef'},{customEdge:true,customEdgeColour:'#fedcba'},{fadeToBorder:true}]){const r=await api.prepareBakedBlock('aẳặ',args(extra));await r.baked.pages[0].canvas.saveAs(path.join(review,'outputs',Object.keys(extra)[0]+'.png'));log(Object.keys(extra)[0]);}

// Compare edge bands and deferred shadows against authored source samples.
const flatControl=await api.prepareBakedBlock('aẳặ',args({texture:'flat'}));
const readFront=(prepared,ch)=>{const d=prepared.baked.models.get(ch),e=d.elements[0],p=prepared.baked.pages[d.page],im=p.ctx.getImageData(0,0,p.width,p.height),u=e.faces.north.uv;return{width:Math.round((u[2]-u[0])*1000/16),height:Math.round((u[3]-u[1])*320/16),at:(x,y)=>pixel(im,u[0]+(x+.5)/1000*16,u[1]+(y+.5)/320*16)};};
const shape=readFront(flatControl,'ẳ'),isInk=(x,y)=>x>=0&&x<shape.width&&y>=0&&y<shape.height&&shape.at(x,y).every(v=>v===255);
for(const style of ['live','neon']){const p=await api.prepareBakedBlock('aẳặ',args({texture:style})),front=readFront(p,'ẳ'),source=await api.makeTexture(args({texture:style,canvas:true})),im=source.getContext('2d').getImageData(0,0,1000,320);
assert.deepEqual(front.at(5,0),pixel(im,595/62.5,180/20));assert.deepEqual(front.at(5,front.height-1),pixel(im,595/62.5,279/20));log('authored edge bands survive height expansion '+style);}
const shadowed=await api.prepareBakedBlock('aẳặ',args({texture:'live'})),shadowFront=readFront(shadowed,'ẳ'),liveCanvas=await api.makeTexture(args({texture:'live',canvas:true})),liveData=liveCanvas.getContext('2d').getImageData(0,0,1000,320),liveSpec=font.textures.live.bakedInkEffect;let shadowChecks=0;
for(let y=0;y<shape.height;y++)for(let x=0;x<shape.width;x++)if(!isInk(x,y)&&isInk(x,y-1)){assert.deepEqual(shadowFront.at(x,y),pixel(liveData,liveSpec.sampleUV[0]/62.5,liveSpec.sampleUV[1]/20));shadowChecks++;}assert.ok(shadowChecks>30);log('Live shadow survives expanded compound glyph',{samples:shadowChecks});
for(const id of ['drop_shadow','drop_shadow_left','drop_shadow_right']){const p=await api.prepareBakedBlock('aẳặ',args({overlay:id,overlayBlend:'source-over'})),front=readFront(p,'ẳ'),[dx,dy]=font.overlays[id].bakedEffect.offset;let tested=0;for(let y=0;y<shape.height;y++)for(let x=0;x<shape.width;x++)if(!isInk(x,y)&&isInk(x-dx,y-dy)){assert.deepEqual(front.at(x,y),[0,0,0,255]);tested++;}assert.ok(tested>30);log('composed overlay shadow '+id,{samples:tested});}
for(const id of ['highlights_top','highlights_bottom']){const p=await api.prepareBakedBlock('aẳặ',args({overlay:id,overlayBlend:'source-over'})),front=readFront(p,'ẳ');assert.deepEqual(front.at(3,id==='highlights_top'?0:front.height-1),[255,255,255,255]);log('overlay follows final edge '+id);}
for(const layout of ['compact','balanced']){const p=await api.prepareBakedBlock('aẳặựẨ',args({_bakedLayout:layout}));assert.ok(p.baked.rowTop>p.baked.rowBottom);const front=readFront(p,'ẳ');assert.ok(front.height>0);log('review layout '+layout,{rowBottom:p.baked.rowBottom,rowTop:p.baked.rowTop});}

const before=made.length,created=await api.addBakedBlockText('aẳặựẨ',args({type:'bottom'}));assert.equal(made.length-before,8);assert.equal(created.textures.length,1);assert.equal(created.group.rotation[0],-90);assert.ok(made.slice(before).every(e=>Object.values(e.faces).every(f=>f.texture===null||created.textures.some(t=>t.uuid===f.texture))));log('actual insertion one cube per character plus border');

// Verify source-frame effects at the exact rows that cross the legacy border/caps.
const borderSource=await api.makeTexture(args({canvas:true,customBorder:true,customBorderColour:'#abcdef'}));
const bd=borderSource.getContext('2d').getImageData(0,0,1000,320);
assert.deepEqual(pixel(bd,0/62.5,246/20),[171,205,239,255]);
assert.deepEqual(pixel(bd,595/62.5,250/20),[137,137,137,255]);log('border recoloring does not erase long frame');
const edgeSource=await api.makeTexture(args({canvas:true,customEdge:true,customEdgeColour:'#fedcba'}));
const ed=edgeSource.getContext('2d').getImageData(0,0,1000,320);assert.deepEqual(pixel(ed,595/62.5,285/20),[254,220,186,255]);assert.deepEqual(pixel(ed,595/62.5,240/20),[137,137,137,255]);log('cap recoloring excludes frame front');
const futureCanvas=await api.makeTexture(args({texture:'future_test',canvas:true}));const futureMaskPixels=mask.ctx.getImageData(0,0,1000,320);const futurePixels=futureCanvas.getContext('2d').getImageData(0,0,1000,320),futurePages=future.baked.pages.map(p=>p.ctx.getImageData(0,0,p.width,p.height));let futureChecks=0;
for(const[ch,def]of future.baked.models)for(const e of font.characters[ch])if(e.faces.north)for(let y=e.from[1];y<e.to[1];y++)for(let x=Math.ceil(e.from[0]);x<e.to[0];x++){const q=uv(e,'north',x+.25,y+.5);if(pixel(futureMaskPixels,...q).every(v=>v===255)){assert.deepEqual(pixel(futurePages[def.page],...uv(def.elements[0],'north',x+.25,y+.5)),pixel(futurePixels,...q));futureChecks++;}}
assert.ok(futureChecks>500);log('new texture exact ink colors',{samples:futureChecks});
const cachedCount=Texture.all.length;await api.addBakedBlockText('aẳặựẨ',args({type:'bottom'}));assert.equal(Texture.all.length,cachedCount);log('identical output reuses existing texture');
const {THREE,loadTexture}=await getTHREE({Canvas:SkiaCanvas,Image,ImageData,fetch,Request,Response,Headers});let renders=0;
context.THREE={...THREE,WebGLRenderer:class{render(scene,camera){assert.ok(scene.children.length);assert.ok(camera.position.toArray().every(Number.isFinite));renders++;}dispose(){}}};
context.Blockbench={showQuickMessage(message){throw Error(message);}};
const vue={...defaults,font:fontId,text:'aẳặựẨ',scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(45,640/360,.1,10000),canvas:new SkiaCanvas(640,360)};
await api.makeBakedBlockPreview(vue);assert.equal(vue.scene.children.length,2);assert.equal(vue.scene.children[0].name,'VĂN BẢN');assert.equal(vue.scene.children[1].name,'VÍ DỤ');const exampleSize=vue.scene.children.map(g=>g.children.length);vue.type='bottom';vue.text='IGNORED INPUT';vue.texture='neon';await api.makeBakedBlockPreview(vue);assert.deepEqual(vue.scene.children.map(g=>g.children.length),exampleSize);assert.equal(vue.scene.children[0].rotation.x,0);assert.equal(vue.scene.children[1].rotation.x,-Math.PI/2);assert.equal(vue.scene.children[1].scale.x,.75);assert.equal(vue.scene.children[1].scale.y,1.6);assert.equal(vue.scene.children[1].scale.z,.75);assert.equal(vue.camera.fov,18);const boxTop=new THREE.Box3().setFromObject(vue.scene.children[0]),boxBottom=new THREE.Box3().setFromObject(vue.scene.children[1]);assert.ok(!boxTop.intersectsBox(boxBottom),'Block example panels overlap');
await Promise.all([api.queueBakedBlockPreview(vue),api.queueBakedBlockPreview(vue),api.queueBakedBlockPreview(vue)]);assert.equal(vue.bakedPreviewBuilding,false);assert.ok(renders>=4);log('actual Three scene preview and queued updates',{renders,gpuRendererMocked:true});
// Render the fixed two-line example through real WebGL at an oblique angle.
for(const group of vue.scene.children)for(const mesh of group.children){const old=mesh.material.map;const texture=await loadTexture(old.image);texture.flipY=true;texture.magFilter=texture.minFilter=THREE.NearestFilter;mesh.material.map=texture;}
const previewGL=createGL(1000,500);assert.ok(previewGL);const previewRenderer=new THREE.WebGLRenderer({context:previewGL}),previewTarget=new THREE.WebGLRenderTarget(1000,500);previewRenderer.setSize(1000,500,false);previewRenderer.setRenderTarget(previewTarget);previewRenderer.render(vue.scene,vue.camera);const previewBytes=Buffer.alloc(1000*500*4);previewGL.readPixels(0,0,1000,500,previewGL.RGBA,previewGL.UNSIGNED_BYTE,previewBytes);assert.ok(previewBytes.some((v,i)=>i%4===3&&v));await sharp(previewBytes,{raw:{width:1000,height:500,channels:4}}).flip().png().toFile(path.join(review,'fixed-two-line-example.png'));previewGL.getExtension('STACKGL_destroy_context').destroy();log('fixed example GPU render');
// Export models made by the actual insertion function for manual GUI acceptance.
fs.mkdirSync(path.join(review,'blockbench'));
for(const mode of ['top','bottom','small']){const start=made.length,result=await api.addBakedBlockText('aẳặựẨ',args({texture:'acacia_planks',type:mode,name:'integrated-'+mode})),cubes=made.slice(start),index=new Map(result.textures.map((t,i)=>[t.uuid,i])),elements=cubes.map(e=>({...e,type:'cube',box_uv:false,autouv:0,origin:[0,0,0],faces:Object.fromEntries(Object.entries(e.faces).map(([k,f])=>[k,{...f,texture:f.texture===null?null:index.get(f.texture)}]))}));
const groupRecords=[],tree=g=>{groupRecords.push({name:g.name,uuid:g.uuid,origin:[0,0,0],rotation:g.rotation,visibility:true,export:true});return{uuid:g.uuid,children:g.children.map(c=>c instanceof Group?tree(c):c.uuid)};};
const outliner=[tree(result.group)],textures=result.textures.map((t,i)=>({name:'integrated-'+mode+'-'+i+'.png',uuid:t.uuid,id:String(i),width:1000,height:320,uv_width:1000,uv_height:320,render_mode:'default',render_sides:'front',visible:true,saved:false,source:t.img.src}));
fs.writeFileSync(path.join(review,'blockbench',mode+'-acacia_planks.bbmodel'),JSON.stringify({meta:{format_version:'5.0',model_format:'minecraft_title',box_uv:false},name:'integrated-'+mode,resolution:{width:1000,height:320},elements,groups:groupRecords,outliner,textures}));}
for(const scenario of smallCases){
 const start=made.length,result=await api.addBakedBlockText(scenario.text,args({texture:'live',type:'small',name:'small-'+scenario.index})),cubes=made.slice(start),index=new Map(result.textures.map((t,i)=>[t.uuid,i]));
 const elements=cubes.map(e=>({...e,type:'cube',box_uv:false,autouv:0,origin:[0,0,0],faces:Object.fromEntries(Object.entries(e.faces).map(([side,f])=>[side,{...f,texture:f.texture===null?null:index.get(f.texture)}]))}));
 const groupRecords=[],tree=g=>{groupRecords.push({name:g.name,uuid:g.uuid,origin:[0,0,0],rotation:g.rotation,visibility:true,export:true});return{uuid:g.uuid,children:g.children.map(c=>c instanceof Group?tree(c):c.uuid)};};
 const outliner=[tree(result.group)],textures=result.textures.map((t,i)=>({name:'small-'+scenario.index+'-'+i+'.png',uuid:t.uuid,id:String(i),width:1000,height:320,uv_width:1000,uv_height:320,render_mode:'default',render_sides:'front',source:t.img.src}));
 fs.writeFileSync(path.join(review,'blockbench','small-'+(scenario.index?'long':'short')+'-live.bbmodel'),JSON.stringify({meta:{format_version:'5.0',model_format:'minecraft_title',box_uv:false},name:scenario.input,resolution:{width:1000,height:320},elements,groups:groupRecords,outliner,textures}));
}
log('integrated BBModels exported with one texture and outside border');

for(const[f,h]of protectedFiles)assert.equal(hash(f),h,'Source asset changed '+f);
const report={review,tests:results,sourceInkSamples:inkSamples,pluginFunctionsExecuted:true,sourceAssetsUnchanged:true,guiVerified:false};fs.writeFileSync(path.join(review,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(root,'backups/block-plugin-integration-test-last.txt'),review);console.log(JSON.stringify({review,tests:results.length,sourceInkSamples:inkSamples,sourceAssetsUnchanged:true,guiVerified:false}));
