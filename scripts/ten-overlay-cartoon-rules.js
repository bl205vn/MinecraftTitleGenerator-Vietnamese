// Local, authored-glyph references for Cartoon. Flat and models stay read-only.
import fs from 'node:fs';
import path from 'node:path';
const S=4,W=4000;
export const cartoonReferenceAudit=[];
function boxes(font,name){
  const model=JSON.parse(fs.readFileSync(path.join(font.base,'characters',name+'.json')));
  return model.elements.filter(e=>e.faces.north&&e.to.every((v,i)=>v>e.from[i])).map(e=>{
    const a=e.faces.north.uv.map((v,i)=>Math.round(v*(i%2?20:62.5)));
    return[Math.min(a[0],a[2]),Math.min(a[1],a[3]),Math.max(a[0],a[2]),Math.max(a[1],a[3])];
  });
}
export function retouchCartoon(output,original,font,ctx){
  cartoonReferenceAudit.length=0;
  const white=(x,y)=>x>=0&&x<1000&&y>=0&&y<320&&font.white[Math.floor(y)*1000+Math.floor(x)];
  function paint(name,box,reference,sample){
    const[x0,y0,x1,y1]=box;let count=0;
    for(let y=y0*S;y<y1*S;y++)for(let x=x0*S;x<x1*S;x++){
      const i=(y*W+x)*4;output.fill(0,i,i+4);
      if(!white(x/S,y/S))continue;
      const color=sample((x+.5)/S-x0,(y+.5)/S-y0);
      if(color?.[3]){output.set(color,i);count++;}
    }
    cartoonReferenceAudit.push({name,box,reference,visibleSubpixels:count});
  }
  function at(x,y){const i=(Math.floor(y*S)*W+Math.floor(x*S))*4;return original.subarray(i,i+4);}
  // Đ's wider hole cannot use one affine shear. Keep D's authored top/left
  // artwork; widen only the hole and shift the existing right stem intact.
  const d=boxes(ctx.source,'d')[0],dd=boxes(font,'đ')[0];
  paint('đ',dd,'d; piecewise stem/hole alignment',(x,y)=>{
    let sx;
    if(x<4)sx=x; // Left end of the added crossbar.
    else if(x<16)sx=y>=16&&y<24?x:x-4;
    else if(x<24)sx=12+(x-16)/2;
    else sx=x-8;
    return at(d[0]+sx,d[1]+y);
  });
  for(const[name,base]of [['ư','u'],['ơ','o']]){
    const target=boxes(font,name),donor=boxes(ctx.source,base)[0];
    const body=target.find(b=>b[3]-b[1]===40),horn=target.find(b=>b[3]-b[1]!==40);
    paint(name+' body',body,base+' first-row body',(x,y)=>at(donor[0]+Math.min(27.875,x),donor[1]+y));
    // The horn is a narrow continuation of the right stem: reuse that stem's
    // original upper highlight rather than a new full-component wedge.
    if(horn)paint(name+' horn',horn,base+' upper right stem',(x,y)=>at(donor[0]+20+x,donor[1]+y));
  }
  // Draw a tapered lip from each sign's own upper silhouette. Sampling another
  // sign's bitmap creates glints in unrelated shoulders and inner concavities.
  function upperLips(name){
    const box=boxes(font,name)[0],[x0,y0,x1,y1]=box,segments=[];
    for(let y=y0;y<y0+Math.ceil((y1-y0)/2);y++){
      let x=x0;
      while(x<x1){
        if(!white(x,y)||white(x,y-1)){x++;continue;}
        const left=x;while(x<x1&&white(x,y)&&!white(x,y-1))x++;
        if(x-left>=4&&(name!=='breve'||y-y0<4))segments.push({left:left-x0,right:x-x0,top:y-y0});
      }
    }
    paint(name,box,'own upper silhouette; tapered left-to-right lip',(x,y)=>{
      const covered=(xx,yy)=>segments.some(s=>xx>=s.left&&xx<s.right&&yy>=s.top&&yy<s.top+Math.min(2,(s.right-xx)*0.2));
      let n=0;for(const dx of [-0.0625,0.0625])for(const dy of [-0.0625,0.0625])n+=covered(x+dx,y+dy);
      return n?[255,255,255,Math.round(255*n/4)]:null;
    });
  }
  for(const name of ['hookabove','tilde','dotbelow','breve'])upperLips(name);
  // Acute/grave share mirrored UVs. A lateral glint would reverse direction.
  // A soft, top-only 1px lip is invariant under horizontal mirroring.
  const acute=boxes(font,'acute')[0],[ax,ay]=acute;
  paint('acute / mirrored grave',acute,'mirror-invariant upper edge',(x,y)=>{
    const gx=ax+x,gy=ay+y;
    let depth=0;
    for(let n=1;n<=4;n++){
      if(!white(gx,gy-n/S))break;
      depth++;
    }
    return depth<4?[255,255,255,Math.round(255*(4-depth)/4)]:null;
  });
  return output;
}
