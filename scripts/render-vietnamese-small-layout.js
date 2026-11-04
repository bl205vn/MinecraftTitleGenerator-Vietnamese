// Render the actual exported model placements; these are review images, not dialog previews.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {Canvas,Image,ImageData,loadImage} from 'skia-canvas';
import getTHREE from 'node-three';
import createGL from 'gl';
import sharp from 'sharp';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const review=fs.readFileSync(path.join(root,'backups/small-axis-layout-last.txt'),'utf8').trim();
const {THREE,loadTexture}=await getTHREE({Canvas,Image,ImageData,fetch,Request,Response,Headers});
for(const id of ['minecraft-ten-vietnamese','minecraft-five-vietnamese','minecraft-five-bold-vietnamese']){
 const model=JSON.parse(fs.readFileSync(path.join(review,id+'-example.bbmodel'))),image=await loadImage(model.textures[0].source),atlas=new Canvas(image.width,image.height);atlas.getContext('2d').drawImage(image,0,0);
 const texture=await loadTexture(atlas);texture.flipY=true;texture.magFilter=texture.minFilter=THREE.NearestFilter;const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,alphaTest:.01});
 for(const [label,selected,direction]of [['top-small',[0,2],[0,-170,-320]],['bottom-small-side',[1,2],[-220,-100,-320]]]){
   const scene=new THREE.Scene();
   for(const index of selected){const sourceGroup=model.groups[index],group=new THREE.Group();group.rotation.fromArray(sourceGroup.rotation.map(n=>n*Math.PI/180));
     for(const uuid of model.outliner[index].children){const e=model.elements.find(e=>e.uuid===uuid),g=new THREE.BoxGeometry(...e.to.map((n,i)=>n-e.from[i])),mesh=new THREE.Mesh(g,material);mesh.position.fromArray(e.from.map((n,i)=>(n+e.to[i])/2));
       for(const[side,offset]of Object.entries({east:0,west:8,up:16,down:24,south:32,north:40})){const f=e.faces[side];if(f?.texture!==null){const u=f.uv.map((n,i)=>n/(i%2?320:1000));[[u[0],1-u[1]],[u[2],1-u[1]],[u[0],1-u[3]],[u[2],1-u[3]]].forEach((v,i)=>g.attributes.uv.array.set(v,offset+i*2));}else for(let i=0;i<6;i++)g.index.array[offset/8*6+i]=0;}
       group.add(mesh);
     }scene.add(group);
   }
   const box=new THREE.Box3().setFromObject(scene),center=box.getCenter(new THREE.Vector3()),camera=new THREE.OrthographicCamera(-1,1,1,-1,1,2000);camera.position.copy(center).addScaledVector(new THREE.Vector3(...direction).normalize(),500);camera.lookAt(center);camera.updateMatrixWorld(true);const inverse=camera.quaternion.clone().invert();let xMax=0,yMax=0;
   for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){const p=new THREE.Vector3(x,y,z).sub(center).applyQuaternion(inverse);xMax=Math.max(xMax,Math.abs(p.x));yMax=Math.max(yMax,Math.abs(p.y));}
   const W=1000,H=500,halfWidth=Math.max(xMax,yMax*W/H)*1.1;camera.left=-halfWidth;camera.right=halfWidth;camera.top=halfWidth*H/W;camera.bottom=-camera.top;camera.updateProjectionMatrix();
   const gl=createGL(W,H);assert.ok(gl);const renderer=new THREE.WebGLRenderer({context:gl}),target=new THREE.WebGLRenderTarget(W,H);renderer.setSize(W,H,false);renderer.setRenderTarget(target);renderer.render(scene,camera);const bytes=Buffer.alloc(W*H*4);gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,bytes);assert.ok(bytes.some((n,i)=>i%4===3&&n));await sharp(bytes,{raw:{width:W,height:H,channels:4}}).flip().png().toFile(path.join(review,id+'-'+label+'.png'));gl.getExtension('STACKGL_destroy_context').destroy();
 }
 console.log('Rendered '+id);
}
