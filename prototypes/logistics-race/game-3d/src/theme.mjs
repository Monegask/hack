import * as T from 'three';

export const THEME={background:0x101c28,ground:0x354b42,soil:0x1b2b2c,grass:[0x3d5145,0x2e443c,0x706a53,0x485747],yard:0x3b464b,orange:0xd58b4c,cream:0xc5c4b1};
// The source GLBs and their atlases remain intact. Derivatives are cached once,
// shared by cloned scene nodes and released with the renderer.
const materials=new Map(),maps=new Map();
export function recolorPixel(r,g,b){
 const light=Math.max(r,g,b)/255;
 if(r>g*1.13&&g>b*1.12&&r>90)return [Math.min(232,r*1.12),Math.min(158,g*1.08),Math.min(91,b*.92)];
 if(light<.16)return [r*.85,g*.94,b];
 if(r>g*.93&&g>b*1.03){const v=.42+.58*light;return [65*v,78*v,87*v];}
 return [r*.67,g*.74,b*.79];
}
function darkAtlas(source){
 if(maps.has(source))return maps.get(source);
 if(!source.image||typeof document==='undefined')return source;
 if(source.isDataTexture){const bytes=source.image.data;if(!(bytes instanceof Uint8Array)||source.format!==T.RGBAFormat)return source;const data=new Uint8Array(bytes);for(let i=0;i<data.length;i+=4){const c=recolorPixel(data[i],data[i+1],data[i+2]);data.set(c,i);}const map=source.clone();map.image={...source.image,data};map.needsUpdate=true;maps.set(source,map);return map;}
 const canvas=document.createElement('canvas');canvas.width=source.image.width;canvas.height=source.image.height;
 const ctx=canvas.getContext?.('2d');if(!ctx)return source;
 ctx.drawImage(source.image,0,0);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
 for(let i=0;i<pixels.data.length;i+=4){const c=recolorPixel(pixels.data[i],pixels.data[i+1],pixels.data[i+2]);pixels.data[i]=c[0];pixels.data[i+1]=c[1];pixels.data[i+2]=c[2];}
 ctx.putImageData(pixels,0,0);const map=source.clone();map.image=canvas;map.colorSpace=T.SRGBColorSpace;map.needsUpdate=true;maps.set(source,map);return map;
}
const named={stone:0x48545b,light:0x6b777c,paving:0x26343c,ink:0x1c2931,cream:0x39464f,glass:0xceb991,red:THEME.orange,steel:0x7c898f,green:0x274b40,water:0x2d5965,gravel:0x606b6d};
const truckColors=new Map([[0xeee5d3,0x71858d],[0xf5eedd,0xb8b8a9],[0xb9ae99,0x56636b],[0x343c37,0x18262f],[0xbe6048,THEME.orange],[0x394b49,0x5d8490]]);
export function applyIndustrialPalette(root,{truck=false}={}){
 root.traverse(o=>{if(!o.isMesh)return;const change=source=>{
  if(source.userData.darkV30)return source;
  const key=(truck?'truck:':'site:')+source.uuid;if(materials.has(key))return materials.get(key);
  const m=source.clone();m.userData.darkV30=true;m.roughness=Math.max(.64,m.roughness??.85);
  if(m.map){m.map=darkAtlas(m.map);m.color.set(0xffffff);}
  else if(m.vertexColors)m.color.set(0xffffff);
  else if(truck)m.color.setHex(truckColors.get(source.color?.getHex())??0x465660);
  else if(named[source.name]!==undefined)m.color.setHex(named[source.name]);
  else if(source.color){const c=source.color.clone().convertLinearToSRGB();const rgb=recolorPixel(c.r*255,c.g*255,c.b*255);m.color.setRGB(...rgb.map(x=>x/255),T.SRGBColorSpace);}
  if(source.name==='glass'){m.emissive.setHex(0xe9b477);m.emissiveIntensity=.85;m.roughness=.45;}
  materials.set(key,m);return m;
 };const sourceMaterials=Array.isArray(o.material)?o.material:[o.material];
 if(sourceMaterials.some(m=>m.vertexColors)&&o.geometry.attributes.color&&!o.geometry.userData.darkV30){const g=o.geometry.clone(),a=g.attributes.color,c=new T.Color();for(let i=0;i<a.count;i++){c.fromBufferAttribute(a,i).convertLinearToSRGB();const rgb=recolorPixel(c.r*255,c.g*255,c.b*255);c.setRGB(...rgb.map(x=>x/255),T.SRGBColorSpace);a.setXYZ(i,c.r,c.g,c.b);}a.needsUpdate=true;g.userData.darkV30=true;o.geometry=g;}
 o.material=Array.isArray(o.material)?o.material.map(change):change(o.material);});
}
export function disposeTheme(){for(const m of materials.values())m.dispose();for(const t of maps.values())t.dispose();materials.clear();maps.clear();}
