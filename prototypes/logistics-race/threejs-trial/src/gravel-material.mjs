import * as T from 'three';

// Deterministic, seamless packed grains. These are material maps, not sprites:
// the imported heap's vertices and silhouette are never displaced or replaced.
export function gravelMaps(size=256,cells=24){
 const hash=(x,y)=>{x=(x%cells+cells)%cells;y=(y%cells+cells)%cells;const a=Math.sin(x*127.1+y*311.7+19.3)*43758.5453;return a-Math.floor(a);};
 const heights=new Float32Array(size*size),shade=new Uint8Array(size*size*4),rough=new Uint8Array(size*size*4),normal=new Uint8Array(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const u=x/size*cells,v=y/size*cells,ix=Math.floor(u),iy=Math.floor(v);let first=10,second=10,tone=0;
  for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++){const gx=ix+i,gy=iy+j,dx=u-gx-.15-.7*hash(gx,gy),dy=v-gy-.15-.7*hash(gy+7,gx+3),d=Math.hypot(dx,dy);if(d<first){second=first;first=d;tone=hash(gx+3,gy+11);}else second=Math.min(second,d);}
  const seam=T.MathUtils.smoothstep(second-first,0,.13),h=seam*(.55+.22*tone)-.12*first,n=(y*size+x),k=n*4;
  heights[n]=h;const c=Math.round(210+30*tone+10*seam),r=Math.round(215+35*(1-seam)+5*tone);
  shade.set([c,c,c,255],k);rough.set([r,r,r,255],k);
 }
 const height=(x,y)=>heights[((y+size)%size)*size+(x+size)%size];
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){const n=new T.Vector3((height(x-1,y)-height(x+1,y))*1.5,(height(x,y-1)-height(x,y+1))*1.5,1).normalize();normal.set([Math.round((n.x*.5+.5)*255),Math.round((n.y*.5+.5)*255),Math.round((n.z*.5+.5)*255),255],(y*size+x)*4);}
 const texture=(data,colorSpace=T.NoColorSpace)=>{const t=new T.DataTexture(data,size,size,T.RGBAFormat);t.wrapS=t.wrapT=T.RepeatWrapping;t.magFilter=T.LinearFilter;t.minFilter=T.LinearMipmapLinearFilter;t.generateMipmaps=true;t.colorSpace=colorSpace;t.needsUpdate=true;return t;};
 return {map:texture(shade,T.SRGBColorSpace),normalMap:texture(normal),roughnessMap:texture(rough)};
}
export function gravelMaterial(){return new T.MeshStandardMaterial({...gravelMaps(),vertexColors:true,roughness:1,metalness:0,normalScale:new T.Vector2(.6,.6),side:T.DoubleSide});}
