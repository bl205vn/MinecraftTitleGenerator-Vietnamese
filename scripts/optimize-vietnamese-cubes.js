// Preserve the accepted Cyrillic-style model surfaces; exact cover of representable input-border groups.
// Inspect by default; --apply backs up and joins only existing border contacts.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const font = path.join(root, 'fonts/minecraft-ten-vietnamese');
const chars = path.join(font, 'characters');
const apply = process.argv.includes('--apply');
assert.ok(process.argv.slice(2).every(a => a === '--apply'));
const hash = b => createHash('sha256').update(b).digest('hex');
const round = n => Math.round(n * 1e10) / 1e10;
const EPS = 1e-7;
const atlasRaw = fs.readFileSync(path.join(font, 'textures/flat.png'));
const atlas = await sharp(atlasRaw).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
assert.equal(atlas.info.width, 1000); assert.equal(atlas.info.height, 320);
function pixel(x, y) {
  x = Math.floor(x); y = Math.floor(y);
  if (x < 0 || y < 0 || x >= 1000 || y >= 320) return [0, 0, 0, 0];
  const p = (y * 1000 + x) * 4;
  return atlas.data.subarray(p, p + 4);
}
const black = pixel(0, 280);
assert.deepEqual([...black], [0, 0, 0, 255]);
const intersect = (a, b) => {
  const r = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
  return r[2] - r[0] > EPS && r[3] - r[1] > EPS ? r : null;
};
const area = r => (r[2] - r[0]) * (r[3] - r[1]);
function subtractOne(r, cut) {
  const i = intersect(r, cut); if (!i) return [r];
  return [[r[0], r[1], i[0], r[3]], [i[2], r[1], r[2], r[3]],
    [i[0], r[1], i[2], i[1]], [i[0], i[3], i[2], r[3]]]
    .filter(p => p[2] - p[0] > EPS && p[3] - p[1] > EPS);
}
const subtract = (rects, cuts) => cuts.reduce((rs, c) => rs.flatMap(r => subtractOne(r, c)), rects);
function merge(rects) {
  const out = [];
  for (const r of rects) out.push(...subtract([r], out));
  let again = true;
  while (again) {
    again = false;
    outer: for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
      const a = out[i], b = out[j];
      const horizontal = Math.abs(a[1] - b[1]) < EPS && Math.abs(a[3] - b[3]) < EPS &&
        (Math.abs(a[2] - b[0]) < EPS || Math.abs(b[2] - a[0]) < EPS);
      const vertical = Math.abs(a[0] - b[0]) < EPS && Math.abs(a[2] - b[2]) < EPS &&
        (Math.abs(a[3] - b[1]) < EPS || Math.abs(b[3] - a[1]) < EPS);
      if (horizontal || vertical) {
        out[i] = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
        out.splice(j, 1); again = true; break outer;
      }
    }
  }
  return out;
}
const totalArea = rs => rs.reduce((s, r) => s + area(r), 0);
function formatModel(model, original) {
  const text = JSON.stringify(model, null, '\t')
    .replace(/\[\n\s+([-0-9.,\s]+)\n\s+\]/g, (_, values) => '[' + values.trim().split(/\s*,\s*/).join(', ') + ']')
    .replace(/\{\n\s+"uv": (\[[^\n]+\]),\n\s+"texture": ("[^"]+")\n\s+\}/g, '{"uv": $1, "texture": $2}')
    .replace(/\{\n\s+"angle": ([^,]+),\n\s+"axis": ("[^"]+"),\n\s+"origin": (\[[^\n]+\])\n\s+\}/g, '{"angle": $1, "axis": $2, "origin": $3}');
  return (text + '\n').replace(/\n/g, original.includes('\r\n') ? '\r\n' : '\n');
}
const definitions = { north: [2, 'from', -1], south: [2, 'to', 1], east: [0, 'to', 1],
  west: [0, 'from', -1], up: [1, 'to', 1], down: [1, 'from', -1] };
function faceInfo(e, side) {
  const [axis, end, sign] = definitions[side], axes = [0, 1, 2].filter(a => a !== axis);
  return { axis, axes, plane: e[end][axis], normal: sign * Math.sign((e.to[axes[0]] - e.from[axes[0]]) * (e.to[axes[1]] - e.from[axes[1]])),
    rect: [Math.min(e.from[axes[0]], e.to[axes[0]]), Math.min(e.from[axes[1]], e.to[axes[1]]),
      Math.max(e.from[axes[0]], e.to[axes[0]]), Math.max(e.from[axes[1]], e.to[axes[1]])] };
}
function uvAt(e, side, p) {
  const [fx, fy, fz] = e.from, [tx, ty, tz] = e.to, [x, y, z] = p;
  let u, v;
  if (side === 'north' || side === 'south') { u = side === 'north' ? (tx - x) / (tx - fx) : (x - fx) / (tx - fx); v = (ty - y) / (ty - fy); }
  else if (side === 'east' || side === 'west') { u = side === 'east' ? (tz - z) / (tz - fz) : (z - fz) / (tz - fz); v = (ty - y) / (ty - fy); }
  else { u = (x - fx) / (tx - fx); v = side === 'up' ? (z - fz) / (tz - fz) : (tz - z) / (tz - fz); }
  const uv = e.faces[side].uv;
  return [uv[0] + (uv[2] - uv[0]) * u, uv[1] + (uv[3] - uv[1]) * v];
}
function opaqueRects(e, side) {
  const info = faceInfo(e, side), { axes, rect } = info;
  const uvAxes = side === 'north' || side === 'south' ? [0, 1] : side === 'east' || side === 'west' ? [2, 1] : [0, 2];
  const breaks = axes.map((a, i) => {
    const [lo, hi] = [rect[i], rect[i + 2]], p = e.from.map((v, k) => (v + e.to[k]) / 2);
    p[info.axis] = info.plane; p[a] = lo;
    const which = uvAxes.indexOf(a), scale = which ? 20 : 62.5, first = uvAt(e, side, p)[which] * scale;
    p[a] = hi; const last = uvAt(e, side, p)[which] * scale, list = [lo, hi];
    if (Math.abs(last - first) > EPS) for (let n = Math.ceil(Math.min(first, last)); n <= Math.floor(Math.max(first, last)); n++) {
      const c = lo + (n - first) / (last - first) * (hi - lo);
      if (c > lo + EPS && c < hi - EPS) list.push(round(c));
    }
    return [...new Set(list)].sort((a, b) => a - b);
  });
  const result = [];
  for (let i = 0; i + 1 < breaks[0].length; i++) for (let j = 0; j + 1 < breaks[1].length; j++) {
    const r = [breaks[0][i], breaks[1][j], breaks[0][i + 1], breaks[1][j + 1]], p = [0, 0, 0];
    p[info.axis] = info.plane; p[axes[0]] = (r[0] + r[2]) / 2; p[axes[1]] = (r[1] + r[3]) / 2;
    const uv = uvAt(e, side, p), rgba = pixel(uv[0] * 62.5, uv[1] * 20);
    if (rgba[3] > 128) { assert.ok(rgba[0] < 8 && rgba[1] < 8 && rgba[2] < 8, 'Nonblack border face'); result.push(r); }
  }
  return merge(result);
}
const contains = (rs, x, y) => rs.some(r => x > r[0] - EPS && x < r[2] - EPS && y > r[1] - EPS && y < r[3] - EPS);
const whiteElement = e => e.to.every((v, a) => v > e.from[a]) && !!e.faces.north;
const partName = e => e.name.split('_cube')[0];

// Existing black/transparent atlas runs can often clip a whole face without adding cubes.
const profiles = [[], []];
for (let orientation = 0; orientation < 2; orientation++) {
  const fixedLimit = orientation ? 160 : 40, variableLo = orientation ? 280 : 0, variableHi = orientation ? 320 : 160;
  for (let f = 0; f < fixedLimit; f++) {
    const fixed = orientation ? f : 280 + f, runs = [];
    for (let v = variableLo; v < variableHi; v++) {
      const p = orientation ? pixel(fixed, v) : pixel(v, fixed);
      const state = p[3] < 128 ? 0 : p[0] < 8 && p[1] < 8 && p[2] < 8 ? 1 : 2;
      if (runs.length && runs.at(-1).state === state) runs.at(-1).end = v + 1;
      else runs.push({ start: v, end: v + 1, state });
    }
    profiles[orientation].push({ fixed, runs });
  }
}
function atlasMask(e, side, desired) {
  const info = faceInfo(e, side), { rect, axes } = info;
  for (let along = 0; along < 2; along++) {
    const other = 1 - along, edges = [...new Set([rect[along], rect[along + 2], ...desired.flatMap(r => [r[along], r[along + 2]])])].sort((a, b) => a - b);
    const runs = []; let valid = true;
    for (let i = 0; i + 1 < edges.length; i++) {
      const c = (edges[i] + edges[i + 1]) / 2, segments = desired.filter(r => c > r[along] && c < r[along + 2]);
      const length = segments.reduce((n, r) => n + r[other + 2] - r[other], 0), full = rect[other + 2] - rect[other];
      if (length > EPS && Math.abs(length - full) > EPS) { valid = false; break; }
      const state = length > EPS ? 1 : 0;
      if (runs.length && runs.at(-1).state === state) runs.at(-1).end = edges[i + 1];
      else runs.push({ start: edges[i], end: edges[i + 1], state });
    }
    if (!valid || runs.length < 2) continue;
    const uvAxes = side === 'north' || side === 'south' ? [0, 1] : side === 'east' || side === 'west' ? [2, 1] : [0, 2];
    const which = uvAxes.indexOf(axes[along]), scale = which ? 20 : 62.5;
    for (const profile of profiles[which]) for (let offset = 0; offset + runs.length <= profile.runs.length; offset++) {
      const src = profile.runs.slice(offset, offset + runs.length);
      if (!src.every((r, i) => r.state === runs[i].state)) continue;
      const ratios = runs.length > 2 ? [(src[1].end - src[0].end) / (runs[1].end - runs[0].end)] : [2, 1, .5, .25, .125, .0625];
      for (const ratio of ratios) {
        const start = src[0].end - ratio * (runs[0].end - rect[along]);
        const end = start + ratio * (rect[along + 2] - rect[along]);
        if (start < src[0].start - EPS || end > src.at(-1).end + EPS) continue;
        if (!runs.slice(0, -1).every((r, i) => Math.abs(start + ratio * (r.end - rect[along]) - src[i].end) < 1e-7)) continue;
        // Map the selected atlas profile to the original face parameter direction.
        const p0 = e.from.map((v, a) => (v + e.to[a]) / 2), p1 = [...p0]; p0[info.axis] = p1[info.axis] = info.plane;
        p0[axes[along]] = rect[along]; p1[axes[along]] = rect[along + 2];
        const oldDelta = e.faces[side].uv[which + 2] - e.faces[side].uv[which];
        const forward = (uvAt(e, side, p1)[which] - uvAt(e, side, p0)[which]) / oldDelta > 0;
        const uv = which === 0 ? [forward ? start / scale : end / scale, profile.fixed / 20,
          forward ? end / scale : start / scale, (profile.fixed + 1) / 20] :
          [profile.fixed / 62.5, forward ? start / scale : end / scale, (profile.fixed + 1) / 62.5, forward ? end / scale : start / scale];
        const rounded = uv.map(v => Math.round(v * 1e5) / 1e5);
        // Use only mappings which remain exact when Blockbench saves five UV decimals.
        const newStart = (forward ? rounded[which] : rounded[which + 2]) * scale;
        const newEnd = (forward ? rounded[which + 2] : rounded[which]) * scale;
        if (!runs.slice(0, -1).every((r, i) => Math.abs(rect[along] + (src[i].end - newStart) / (newEnd - newStart) * (rect[along + 2] - rect[along]) - r.end) < 1e-7)) continue;
        return rounded;
      }
    }
  }
  return null;
}

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
const representationCache=new Map(),candidateCache=new Map();
const surfaceKey=f=>[f.axis,round(f.plane),f.normal].join('/');
function representation(e){
 const signature=JSON.stringify([e.from,e.to,e.faces]);if(representationCache.has(signature))return representationCache.get(signature);
 const faces=[];
 for(const side of Object.keys(e.faces)){const info=faceInfo(e,side),rects=opaqueRects(e,side);if(rects.length)faces.push({...info,key:surfaceKey(info),rects,source:e,side});}
 representationCache.set(signature,faces);return faces;
}
function unionSurfaces(elements){const map=new Map();for(const e of elements)for(const f of representation(e)){if(!map.has(f.key))map.set(f.key,[]);map.get(f.key).push(...f.rects);}for(const[k,rs]of map)map.set(k,merge(rs));return map;}
function sameRects(a,b){return totalArea(subtract(a,b))+totalArea(subtract(b,a))<1e-5;}
function sameSurfaces(a,b){for(const k of new Set([...a.keys(),...b.keys()]))if(!sameRects(a.get(k)||[],b.get(k)||[]))return false;return true;}
function buildGroup(elements,faces,lo,hi){
 const maps=new Map();for(const f of faces){if(!maps.has(f.key))maps.set(f.key,[]);maps.get(f.key).push(...f.rects);}for(const[k,rs]of maps)maps.set(k,merge(rs));
 const sig=JSON.stringify([lo,hi,[...maps].sort((a,b)=>a[0].localeCompare(b[0]))]);
 if(candidateCache.has(sig))return candidateCache.get(sig);
 const signs=[elements[0].to.map((v,i)=>v>elements[0].from[i]?1:-1)];
 for(let mask=0;mask<8;mask++){const s=[0,1,2].map(i=>mask&(1<<i)?1:-1);if(!signs.some(x=>x.every((v,i)=>v===s[i])))signs.push(s);}
 for(const sign of signs){
  const e={name:'border_optimized',from:lo.map((v,i)=>sign[i]>0?v:hi[i]),to:hi.map((v,i)=>sign[i]>0?v:lo[i]),faces:{}};
  let valid=true;const accounted=new Set();
  for(const side of Object.keys(definitions)){
   const info=faceInfo(e,side),key=surfaceKey(info),desired=maps.get(key);if(!desired)continue;
   let uv=null;
   if(Math.abs(totalArea(desired)-area(info.rect))<EPS)uv=[0,14,.016,14.05];
   if(!uv){
    // Reuse an existing two-dimensional mask when its opaque surface already equals the target.
    for(const f of faces){if(f.key!==key||!sameRects(f.rects,desired))continue;
     const p0=[...e.from],p1=[...e.to];p0[info.axis]=p1[info.axis]=info.plane;
     if(side==='north'||side==='south'||side==='east'||side==='west'){p0[1]=e.to[1];p1[1]=e.from[1];}
     if(side==='north'){p0[0]=e.to[0];p1[0]=e.from[0];}
     if(side==='east'){p0[2]=e.to[2];p1[2]=e.from[2];}
     if(side==='down'){p0[2]=e.to[2];p1[2]=e.from[2];}
     const proposed=[...uvAt(f.source,f.side,p0),...uvAt(f.source,f.side,p1)];
     if(!proposed.every(v=>v>=0&&v<=16))continue;
     e.faces[side]={uv:proposed,texture:'#1'};
     try{if(sameRects(opaqueRects(e,side),desired)){uv=proposed;break;}}catch{}
    }
   }
   if(!uv){e.faces[side]={uv:[0,14,.016,14.05],texture:'#1'};uv=atlasMask(e,side,desired);}
   if(!uv){valid=false;break;}
   e.faces[side]={uv,texture:'#1'};
   if(!sameRects(opaqueRects(e,side),desired)){valid=false;break;}
   accounted.add(key);
  }
  if(valid&&accounted.size===maps.size){candidateCache.set(sig,e);return e;}
 }
 candidateCache.set(sig,null);return null;
}

// A second search can distribute whole input faces across boxes instead of keeping input cubes together.
function optimizeFaces(borders, groups, fallback) {
 const atoms=borders.flatMap(representation),count=atoms.length;
 if(!count)return fallback;
 const full=(1n<<BigInt(count))-1n,pop=b=>{let n=0;while(b){b&=b-1n;n++;}return n;};
 const bank=new Map();
 function add(e){
  const out=representation(e);let bits=0n;
  for(let i=0;i<count;i++){const atom=atoms[i],rs=out.filter(f=>f.key===atom.key).flatMap(f=>f.rects);if(totalArea(subtract(atom.rects,rs))<1e-5)bits|=1n<<BigInt(i);}
  if(!bits)return;const key=bits.toString(),prev=bank.get(key);
  if(!prev||Object.keys(e.faces).length<Object.keys(prev.e.faces).length)bank.set(key,{bits,e});
 }
 for(const e of groups.values())add(e);
 const boxes=new Map();
 function box(e){const k=JSON.stringify([e.from,e.to]);if(!boxes.has(k))boxes.set(k,e);}
 for(const e of groups.values())box(e);
 // Existing face planes constrain five coordinates. Opposite caps can share a box even when their unused depths differ.
 for(let a=0;a<atoms.length;a++)for(let b=a+1;b<atoms.length;b++){
  const fs=[atoms[a],atoms[b]],lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
  for(const f of fs){lo[f.axis]=Math.min(lo[f.axis],f.plane);hi[f.axis]=Math.max(hi[f.axis],f.plane);for(let k=0;k<2;k++)for(const r of f.rects){lo[f.axes[k]]=Math.min(lo[f.axes[k]],r[k]);hi[f.axes[k]]=Math.max(hi[f.axes[k]],r[k+2]);}}
  if(lo.some((v,i)=>hi[i]-v<EPS))continue;
  if(fs.some(f=>Math.abs(f.plane-lo[f.axis])>EPS&&Math.abs(f.plane-hi[f.axis])>EPS))continue;
  for(let sign=0;sign<8;sign++)box({from:lo.map((v,i)=>sign&(1<<i)?v:hi[i]),to:hi.map((v,i)=>sign&(1<<i)?v:lo[i]),faces:{}});
 }
 for(const proto of boxes.values()){
  const lo=proto.from.map((v,i)=>Math.min(v,proto.to[i])),hi=proto.from.map((v,i)=>Math.max(v,proto.to[i])),slots=[];
  for(const side of Object.keys(definitions)){
   const info=faceInfo(proto,side),key=surfaceKey(info),eligible=atoms.filter(f=>f.key===key&&f.rects.every(r=>r[0]>=info.rect[0]-EPS&&r[1]>=info.rect[1]-EPS&&r[2]<=info.rect[2]+EPS&&r[3]<=info.rect[3]+EPS));
   if(!eligible.length)continue;
   const alternatives=[];const seen=new Set();
   for(const fs of [eligible,...eligible.map(f=>[f])]){
    const e=buildGroup([proto],fs,lo,hi);if(!e||JSON.stringify(e.from)!==JSON.stringify(proto.from)||JSON.stringify(e.to)!==JSON.stringify(proto.to))continue;
    const f=e.faces[side];if(!f)continue;const k=JSON.stringify(f.uv);if(seen.has(k))continue;seen.add(k);alternatives.push(f);
    if(fs===eligible)break; // Full coverage dominates its individual subsets on this slot.
   }
   if(alternatives.length)slots.push({side,alternatives});
  }
  let variants=[{name:'border_optimized',from:proto.from,to:proto.to,faces:{}}];
  for(const slot of slots){const next=[];for(const e of variants)for(const face of slot.alternatives){next.push({...e,faces:{...e.faces,[slot.side]:face}});if(next.length>=64)break;}variants=next.slice(0,64);}
  for(const e of variants)if(Object.keys(e.faces).length)add(e);
 }
 let options=[...bank.values()];
 options=options.filter((c,i)=>!options.some((d,j)=>i!==j&&c.bits!==d.bits&&(c.bits&d.bits)===c.bits));
 const byAtom=atoms.map((_,i)=>options.filter(c=>c.bits&(1n<<BigInt(i))));
 let best=fallback,visits=0;const memo=new Map(),deadline=Date.now()+300;
 function search(covered,chosen){
  if(covered===full){if(chosen.length<best.length)best=chosen.map(c=>c.e);return;}
  if(chosen.length+1>=best.length||++visits>20000||Date.now()>deadline)return;
  const key=covered.toString();if(memo.has(key)&&memo.get(key)<=chosen.length)return;memo.set(key,chosen.length);
  const remaining=full^covered;let atom=-1;
  for(let i=0;i<count;i++)if(remaining&(1n<<BigInt(i)))if(atom<0||byAtom[i].length<byAtom[atom].length)atom=i;
  const choices=byAtom[atom].map(c=>({...c,gain:pop(c.bits&remaining)})).sort((a,b)=>b.gain-a.gain);
  for(const c of choices)search(covered|c.bits,[...chosen,c]);
 }
 search(0n,[]);return best;
}

const plans=[],records=[];let cubesBefore=0,cubesAfter=0,facesBefore=0,facesAfter=0,enumeratedGroups=0;
for(const [number,target]of targets.entries()){
 const file=path.join(chars,target.filename),raw=fs.readFileSync(file,'utf8'),old=JSON.parse(raw),model=structuredClone(old);
 assert.ok(old.elements.every(e=>!e.rotation?.angle),'Rotated cube needs manual review');
 const whites=old.elements.filter(whiteElement),borders=old.elements.filter(e=>!whiteElement(e)),reps=borders.map(representation),n=borders.length;
 assert.ok(n<20,'Too many borders for bounded exhaustive grouping');
 const options=Array.from({length:n},()=>[]),groups=new Map();
 for(let mask=1;mask<(1<<n);mask++){
  const indices=[];for(let i=0;i<n;i++)if(mask&(1<<i))indices.push(i);
  if(indices.length===1){const i=indices[0];groups.set(mask,borders[i]);options[i].push(mask);continue;}
  enumeratedGroups++;
  const fs=indices.flatMap(i=>reps[i]),lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
  for(const f of fs){lo[f.axis]=Math.min(lo[f.axis],f.plane);hi[f.axis]=Math.max(hi[f.axis],f.plane);for(let a=0;a<2;a++)for(const r of f.rects){lo[f.axes[a]]=Math.min(lo[f.axes[a]],r[a]);hi[f.axes[a]]=Math.max(hi[f.axes[a]],r[a+2]);}}
  if(!fs.length)continue;
  for(let a=0;a<3;a++)if(hi[a]-lo[a]<EPS){lo[a]=Math.min(...indices.flatMap(i=>[borders[i].from[a],borders[i].to[a]]));hi[a]=Math.max(...indices.flatMap(i=>[borders[i].from[a],borders[i].to[a]]));}
  if(fs.some(f=>Math.abs(f.plane-lo[f.axis])>EPS&&Math.abs(f.plane-hi[f.axis])>EPS))continue;
  const e=buildGroup(indices.map(i=>borders[i]),fs,lo,hi);if(!e)continue;
  groups.set(mask,e);for(const i of indices)options[i].push(mask);
 }
 const memo=new Map([[0,[]]]);
 function solve(mask){
  if(memo.has(mask))return memo.get(mask);let first=0;while(!(mask&(1<<first)))first++;
  let best=null;
  for(const g of options[first])if((mask&g)===g){const rest=solve(mask^g);if(!best||rest.length+1<best.length)best=[g,...rest];if(best.length===1)break;}
  memo.set(mask,best);return best;
 }
 const chosen=solve((1<<n)-1);let packed=chosen.map((g,i)=>({...structuredClone(groups.get(g)),name:groups.get(g).name==='border_optimized'?'border_optimized_'+(i+1):groups.get(g).name}));
 packed=optimizeFaces(borders,groups,packed).map((e,i)=>({...structuredClone(e),name:e.name==='border_optimized'?'border_optimized_'+(i+1):e.name}));
 // Prefer original objects and order whenever no cube reduction was found.
 if(packed.length<n)model.elements=[...whites.map(e=>structuredClone(e)),...packed];
 assert.deepEqual(model.elements.filter(whiteElement),whites,'White elements changed');
 assert.ok(sameSurfaces(unionSurfaces(borders),unionSurfaces(model.elements.filter(e=>!whiteElement(e)))),'Border surfaces changed: '+target.filename);
 for(let axis=0;axis<3;axis++){const extent=m=>[Math.min(...m.elements.flatMap(e=>[e.from[axis],e.to[axis]])),Math.max(...m.elements.flatMap(e=>[e.from[axis],e.to[axis]]))];assert.deepEqual(extent(model),extent(old),'Model extent changed');}
 const fc=m=>m.elements.reduce((s,e)=>s+Object.keys(e.faces).length,0);cubesBefore+=old.elements.length;cubesAfter+=model.elements.length;facesBefore+=fc(old);facesAfter+=fc(model);
 if(model.elements.length<old.elements.length){records.push({...target,before:old.elements.length,after:model.elements.length,candidateGroups:groups.size});plans.push({file,raw,output:formatModel(model,raw),sha256:hash(formatModel(model,raw))});}
 if((number+1)%10===0)console.error('Inspected '+(number+1)+'/81 models');
}
const summary={inspected:targets.length,filesToChange:plans.length,cubesBefore,cubesAfter,savedCubes:cubesBefore-cubesAfter,facesBefore,facesAfter,enumeratedGroups,whiteElementsUnchanged:true,borderOpaqueSurfacesAndNormalsUnchanged:true,atlasSHA256:hash(atlasRaw),searchScope:'Exhaustive whole-border grouping plus bounded whole-face set-cover search; existing atlas only; no global minimum claim',records};
if(apply&&plans.length){
 for(const p of plans)assert.equal(fs.readFileSync(p.file,'utf8'),p.raw,'Concurrent edit');assert.ok(fs.readFileSync(path.join(font,'textures/flat.png')).equals(atlasRaw));
 fs.mkdirSync(path.join(root,'backups'),{recursive:true});const backup=fs.mkdtempSync(path.join(root,'backups/optimize-accepted-cubes-'));fs.mkdirSync(path.join(backup,'characters'));
 for(const p of plans)fs.writeFileSync(path.join(backup,'characters',path.basename(p.file)),p.raw,{flag:'wx'});
 summary.backup=backup;fs.writeFileSync(path.join(backup,'manifest.json'),JSON.stringify(summary,null,2)+'\n');
 for(const p of plans){assert.equal(fs.readFileSync(p.file,'utf8'),p.raw);fs.writeFileSync(p.file,p.output);assert.equal(hash(fs.readFileSync(p.file)),p.sha256);}
 assert.ok(fs.readFileSync(path.join(font,'textures/flat.png')).equals(atlasRaw));
}else if(!apply){fs.mkdirSync(path.join(root,'backups'),{recursive:true});fs.writeFileSync(path.join(root,'backups/optimize-accepted-cubes-dryrun.json'),JSON.stringify({summary,plans},null,2)+'\n');}
console.log(JSON.stringify({...summary,records:undefined},null,2));
