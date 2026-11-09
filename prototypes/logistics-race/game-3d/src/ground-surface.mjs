import * as T from 'three';
import {LAND} from './terrain-layout.mjs';
import {THEME} from './theme.mjs';

// One opaque surface replaces the coplanar coloured polygons and hill skirts.
// Sample the same outline as the soil slab, including its rounded corners.
export function createGroundGeometry(plan,outline,spacing=.65){
 const minZ=Math.min(...outline.map(p=>-p.y)),maxZ=Math.max(...outline.map(p=>-p.y));
 const minX=Math.min(...outline.map(p=>p.x)),maxX=Math.max(...outline.map(p=>p.x));
 const nx=Math.ceil((maxX-minX)/spacing),nz=Math.ceil((maxZ-minZ)/spacing),positions=[],indices=[];
 for(let j=0;j<=nz;j++){
  const z=minZ+(maxZ-minZ)*j/nz,crossings=[];
  for(let i=0;i<outline.length;i++){
   const a=outline[i],b=outline[(i+1)%outline.length],az=-a.y,bz=-b.y;
   if(Math.abs(az-bz)<1e-8){if(Math.abs(z-az)<1e-7)crossings.push(a.x,b.x);continue;}
   const t=(z-az)/(bz-az);if(t>=-1e-7&&t<=1+1e-7)crossings.push(a.x+(b.x-a.x)*Math.max(0,Math.min(1,t)));
  }
  const left=Math.min(...crossings),right=Math.max(...crossings);
  for(let i=0;i<=nx;i++){
   const x=left+(right-left)*i/nx;
   positions.push(x,plan.insideMountain(x,z)?LAND.groundY:plan.heightAt(x,z),z);
   if(i<nx&&j<nz){const a=j*(nx+1)+i,b=a+1,c=a+nx+1,d=c+1;indices.push(a,c,b,b,c,d);}
  }
 }
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

// Additive, normalized weights: overlapping biomes blend rather than overpaint.
// This small offline-safe data map encodes coverage, not a blurry colour image.
export function createGroundWeights(plan,width=768){
 const height=Math.round(width*plan.land.depth/plan.land.width),data=new Uint8Array(width*height*4);
 const minX=plan.land.centerX-plan.land.width/2,minZ=-plan.land.depth/2;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const px=minX+(x+.5)/width*plan.land.width,pz=minZ+(y+.5)/height*plan.land.depth,w=[.75,0,0,0];
  for(const p of plan.patches){
   const dx=px-p.x,dz=pz-p.z,c=Math.cos(p.rotation),s=Math.sin(p.rotation);
   const r=Math.hypot((dx*c-dz*s)/p.rx,(dx*s+dz*c)/p.rz);
   const u=Math.max(0,Math.min(1,(1-r)/.32));
   w[p.color]+=.85*u*u*(3-2*u);
  }
  const sum=w.reduce((a,b)=>a+b,0),i=(y*width+x)*4;
  for(let k=0;k<4;k++)data[i+k]=Math.round(w[k]/sum*255);
 }
 const texture=new T.DataTexture(data,width,height,T.RGBAFormat);texture.minFilter=texture.magFilter=T.LinearFilter;texture.wrapS=texture.wrapT=T.ClampToEdgeWrapping;texture.needsUpdate=true;return texture;
}

const groundShader=`
uniform sampler2D groundWeights;
uniform vec4 groundBounds;
uniform vec3 groundColors[4];
varying vec3 vGroundWorld;
float soilHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float soilNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(soilHash(i),soilHash(i+vec2(1,0)),f.x),mix(soilHash(i+vec2(0,1)),soilHash(i+vec2(1,1)),f.x),f.y);}
vec4 soilWeights(vec2 p){
 vec2 warp=vec2(soilNoise(p*.75),soilNoise(p*.75+31.0))-.5;
 vec2 uv=(p+warp*.7-groundBounds.xy)/groundBounds.zw;
 vec4 w=texture2D(groundWeights,uv);return w/max(dot(w,vec4(1.0)),.001);
}
float soilDetail(vec2 p){
 float pixel=length(fwidth(p));
 float grit=mix(.5,soilNoise(p*9.0),1.0-smoothstep(.06,.24,pixel));
 return (soilNoise(p*2.8)-.5)*.035+(grit-.5)*.018;
}
vec3 soilSurface(vec2 p){
 vec4 w=soilWeights(p);
 vec3 color=groundColors[0]*w.x+groundColors[1]*w.y+groundColors[2]*w.z+groundColors[3]*w.w;
 float pixel=length(fwidth(p));
 float grain=mix(.5,soilNoise(p*8.0),1.0-smoothstep(.07,.28,pixel));
 float chips=smoothstep(.72,.88,soilNoise(p*3.5))*(1.0-smoothstep(.16,.6,pixel));
 color*=.86+soilNoise(p*1.5)*.18+grain*.18;
 color=mix(color,vec3(.12,.15,.14),chips*(.18+w.z*.5));
 return color;
}
`;

export function createGroundMaterial(plan){
 const weights=createGroundWeights(plan),land=plan.land;
 const material=new T.MeshStandardMaterial({roughness:.97});
 const uniforms={groundWeights:{value:weights},groundBounds:{value:new T.Vector4(land.centerX-land.width/2,-land.depth/2,land.width,land.depth)},groundColors:{value:[THEME.ground,0x30493b,0x615e48,0x4a574b].map(c=>new T.Color(c))}};
 material.name='ContinuousGrainGround';material.customProgramCacheKey=()=> 'continuous-ground-v1';
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,uniforms);
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vGroundWorld;').replace('#include <begin_vertex>','#include <begin_vertex>\nvGroundWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\n'+groundShader).replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb=soilSurface(vGroundWorld.xz);').replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
vec3 soilQ0=dFdx(-vViewPosition),soilQ1=dFdy(-vViewPosition);
vec3 soilR1=cross(soilQ1,normal),soilR2=cross(normal,soilQ0);
float soilDet=dot(soilQ0,soilR1),soilHeight=soilDetail(vGroundWorld.xz);
normal=normalize(abs(soilDet)*normal-sign(soilDet)*(dFdx(soilHeight)*soilR1+dFdy(soilHeight)*soilR2));`);
 };
 material.addEventListener('dispose',()=>weights.dispose());return material;
}
