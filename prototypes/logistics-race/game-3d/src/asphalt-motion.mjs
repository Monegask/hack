export function articulateAsphalt(root){
 const Vector3=root.position.constructor,find=name=>{let node=root.getObjectByName(name);if(!node)root.traverse(o=>{if(o.userData.motionId===name)node=o;});return node;};
 const meta=root.userData.procedural||root.children.find(o=>o.userData.procedural)?.userData.procedural,drum=find('Motion.Drum'),fan=find('Motion.Fan'),a=new Vector3(...meta.belt.a),b=new Vector3(...meta.belt.b),d=b.clone().sub(a).normalize(),n=new Vector3(0,-d.z,d.y),r=meta.belt.radius,len=a.distanceTo(b),loop=2*len+2*Math.PI*r;
 const cleats=Array.from({length:20},(_,i)=>find('Motion.Cleat.'+i)),gravel=Array.from({length:9},(_,i)=>find('Motion.Gravel.'+i)),buckets=Array.from({length:9},(_,i)=>find('Motion.Bucket.'+i));
 if(!drum||!fan||[...cleats,...gravel,...buckets].some(o=>!o))throw new Error('Asphalt animation nodes are missing after GLB import');
 function beltPose(distance){let s=((distance%loop)+loop)%loop,p,tangent;
  if(s<len){p=a.clone().addScaledVector(d,s).addScaledVector(n,r);tangent=d.clone();}
  else if((s-=len)<Math.PI*r){const q=s/r;p=b.clone().addScaledVector(n,r*Math.cos(q)).addScaledVector(d,r*Math.sin(q));tangent=n.clone().multiplyScalar(-Math.sin(q)).addScaledVector(d,Math.cos(q));}
  else if((s-=Math.PI*r)<len){p=b.clone().addScaledVector(d,-s).addScaledVector(n,-r);tangent=d.clone().negate();}
  else {s-=len;const q=s/r;p=a.clone().addScaledVector(n,-r*Math.cos(q)).addScaledVector(d,-r*Math.sin(q));tangent=n.clone().multiplyScalar(Math.sin(q)).addScaledVector(d,-Math.cos(q));}
  return {p,angle:-Math.atan2(tangent.y,tangent.z)};
 }
 return {beltPose,meta,update(time){drum.rotation.x=time*.45;fan.rotation.z=time*3.4;for(const [i,o] of cleats.entries()){const v=beltPose(time*.36+i*loop/cleats.length);o.position.copy(v.p);o.rotation.x=v.angle;}for(const [i,o] of gravel.entries()){const u=(time*.22+i/gravel.length)%1;o.position.copy(a).addScaledVector(d,u*len).addScaledVector(n,r+.055);o.position.x+=Math.sin(i*13)*.12;}for(const [i,o] of buckets.entries()){const u=(time*.21+i/buckets.length)%1;o.position.set(1.10,.45+u*3.10,-.14);o.visible=u<.96;}}};
}
