import * as T from 'three';

// CC0 rock_face_03 (Poly Haven), triplanar world-space sampling, with procedural
// strata and snow. No UV stretching on steep faces; offline builds embed maps.
const surfaceShader=`
uniform sampler2D rockAlbedo;
uniform sampler2D rockNormal;
varying vec3 vMountainWorld;
varying vec3 vMountainNormal;
varying float vMountainMask;
vec3 rockWeights(vec3 n){vec3 w=pow(abs(normalize(n)),vec3(4.0));return w/(w.x+w.y+w.z);}
vec3 rockMap(vec3 p,vec3 n){vec3 w=rockWeights(n);return texture2D(rockAlbedo,p.zy*.18).rgb*w.x+texture2D(rockAlbedo,p.xz*.18).rgb*w.y+texture2D(rockAlbedo,p.xy*.18).rgb*w.z;}
vec3 rockNormalDetail(vec3 p,vec3 n){vec3 w=rockWeights(n),a=texture2D(rockNormal,p.zy*.18).xyz*2.0-1.0,b=texture2D(rockNormal,p.xz*.18).xyz*2.0-1.0,c=texture2D(rockNormal,p.xy*.18).xyz*2.0-1.0;return vec3(b.x*w.y+c.x*w.z,a.y*w.x+c.y*w.z,a.x*w.x+b.y*w.y);}
float rockHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float rockNoise(vec3 p){
 vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
 return mix(mix(mix(rockHash(i),rockHash(i+vec3(1,0,0)),f.x),mix(rockHash(i+vec3(0,1,0)),rockHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(rockHash(i+vec3(0,0,1)),rockHash(i+vec3(1,0,1)),f.x),mix(rockHash(i+vec3(0,1,1)),rockHash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float rockGrain(vec3 p){
 float pixel=length(fwidth(p));
 float coarse=rockNoise(p*.85);
 float detail=mix(.5,rockNoise(p*1.9),1.0-smoothstep(.22,.75,pixel));
 float micro=mix(.5,rockNoise(p*5.1),1.0-smoothstep(.08,.32,pixel));
 return coarse*.3+detail*.5+micro*.2;
}
float rockBump(vec3 point){
 vec3 p=point;if(p.x>57.0){p.x=114.0-p.x;p.z=-p.z;}
 float pixel=length(fwidth(p));
 return (rockNoise(p*1.65)-.5)*.16*(1.0-smoothstep(.22,.8,pixel))+(rockNoise(p*4.4)-.5)*.045*(1.0-smoothstep(.08,.35,pixel));
}
vec3 alpineSurface(vec3 point,vec3 surfaceNormal){
 vec3 p=point;if(p.x>57.0){p.x=114.0-p.x;p.z=-p.z;}
 float broad=rockNoise(p*.43),up=abs(normalize(surfaceNormal).y);
 float grain=rockGrain(p);
 float strata=rockNoise(p*vec3(1.4,.18,1.4));
 float cracks=pow(1.0-abs(strata*2.0-1.0),16.0)*smoothstep(.4,.75,rockNoise(p*.95));
 vec3 stone=rockMap(p,surfaceNormal);
 vec3 rock=mix(vec3(.038,.052,.065),vec3(.17,.22,.25),broad*.72+strata*.28)*(.65+stone*2.1);
 rock*=.72+grain*.7;rock*=1.0-cracks*.35;
 float snowLine=5.4+broad*2.3+(1.0-up)*2.0;
 float shelf=smoothstep(.12,.48,up);
 float cap=smoothstep(11.5,17.0,p.y)*.4;
 float snow=smoothstep(snowLine-.65,snowLine+.4,p.y)*clamp(shelf+cap,0.0,1.0);
 // Narrow snow ribbons collect in ledges below the continuous summit cover.
 snow=max(snow,smoothstep(5.5,9.0,p.y)*cracks*shelf*.55);
 vec3 ice=vec3(.77,.85,.91)+grain*.09;
 vec3 surface=mix(rock,ice,snow);
 return mix(vec3(.035,.072,.055),surface,smoothstep(.08,.65,p.y));
}
`;

export function createMountainMaterial(){
 const material=new T.MeshStandardMaterial({vertexColors:true,roughness:.94,flatShading:true});
 const fallback=(rgb,colorSpace)=>{const t=new T.DataTexture(new Uint8Array([...rgb,255]),1,1);t.colorSpace=colorSpace;t.needsUpdate=true;return t;};
 const albedo=fallback([130,130,130],T.SRGBColorSpace),normal=fallback([128,128,255],T.NoColorSpace),uniforms={rockAlbedo:{value:albedo},rockNormal:{value:normal}},owned=[albedo,normal];
 const load=(url,key,colorSpace)=>{const texture=new T.TextureLoader().load(url,()=>{uniforms[key].value=texture;});texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.colorSpace=colorSpace;texture.anisotropy=4;owned.push(texture);};
 if(typeof __ROCK_TEXTURE_URL__!=='undefined'){load(__ROCK_TEXTURE_URL__,'rockAlbedo',T.SRGBColorSpace);load(__ROCK_NORMAL_URL__,'rockNormal',T.NoColorSpace);}
 material.addEventListener('dispose',()=>owned.forEach(t=>t.dispose()));
 material.customProgramCacheKey=()=> 'alpine-rock-snow-v30-pbr';
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,uniforms);
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float mountainMask;\nvarying vec3 vMountainWorld;\nvarying vec3 vMountainNormal;\nvarying float vMountainMask;')
   .replace('#include <begin_vertex>','#include <begin_vertex>\nvMountainWorld=(modelMatrix*vec4(transformed,1.0)).xyz;\nvMountainNormal=normalize(mat3(modelMatrix)*normal);\nvMountainMask=mountainMask;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\n'+surfaceShader)
   .replace('#include <color_fragment>','#include <color_fragment>\nif(vMountainMask>.5){if(vMountainWorld.y<.055)discard;diffuseColor.rgb=alpineSurface(vMountainWorld,vMountainNormal);}')
   .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
if(vMountainMask>.5){
 vec3 q0=dFdx(-vViewPosition),q1=dFdy(-vViewPosition);
 vec3 r1=cross(q1,normal),r2=cross(normal,q0);
 float det=dot(q0,r1),height=rockBump(vMountainWorld);
 vec3 gradient=sign(det)*(dFdx(height)*r1+dFdy(height)*r2);
 normal=normalize(abs(det)*normal-gradient);
 vec3 detail=rockNormalDetail(vMountainWorld,vMountainNormal);
 normal=normalize(normal+mat3(viewMatrix)*detail*.42*(1.0-smoothstep(7.0,16.0,vMountainWorld.y)*.8));
}`);
 };
 return material;
}
