import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from '../../threejs-trial/node_modules/esbuild/lib/main.js';
import {fileURLToPath} from 'node:url';
import RaceWorld from '../../dist/race-world.js';
import Scene from '../../dist/map-scene.js';
import {createTerrainPlan,LAND} from '../src/terrain-layout.mjs';

const bundled=await build({stdin:{contents:"import * as T from 'three';export {T};export * from './ground-surface.mjs';export * from './environment.mjs';",resolveDir:fileURLToPath(new URL('../src',import.meta.url))},nodePaths:[fileURLToPath(new URL('../../threejs-trial/node_modules',import.meta.url))],bundle:true,format:'esm',platform:'node',write:false});
const api=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
const E=RaceWorld.create(42).player,plan=createTerrainPlan(E,Scene.models);

test('Overlapping biomes form normalized continuous coverage, independently of draw order',()=>{
 const first=api.createGroundWeights(plan,128),second=api.createGroundWeights({...plan,patches:[...plan.patches].reverse()},128);
 assert.deepEqual(first.image.data,second.image.data);
 for(let i=0;i<first.image.data.length;i+=4){const w=first.image.data.slice(i,i+4);assert(Math.abs(w.reduce((a,b)=>a+b,0)-255)<=2);assert(w[0]>0);}
 assert.equal(first.generateMipmaps,false);assert.equal(first.minFilter,api.T.LinearFilter);
 let disposed=false;first.addEventListener('dispose',()=>disposed=true);first.dispose();assert(disposed);second.dispose();
});

test('Ground blends hills into a single nonoverlapping opaque mesh while keeping mountain gates flat',()=>{
 const env=api.createEnvironment(E,Scene.models),surface=env.group.getObjectByName('ContinuousGround');assert(surface);
 const slab=env.group.children[0];slab.geometry.computeBoundingBox();assert(slab.geometry.boundingBox.max.y<LAND.groundY-.01,'Soil cap must stay below the ground: coplanar caps cause triangular z-fighting');
 const g=surface.geometry,p=g.attributes.position,n=g.attributes.normal;assert(g.index);assert(p.count<100000);assert.equal(surface.material.transparent,false);
 let raised=0;
 for(let i=0;i<p.count;i++){
  const x=p.getX(i),y=p.getY(i),z=p.getZ(i);assert(Number.isFinite(x+y+z));assert(Number.isFinite(n.getX(i)+n.getY(i)+n.getZ(i)));
  assert(Math.abs(y-(plan.insideMountain(x,z)?LAND.groundY:plan.heightAt(x,z)))<1e-4);
  if(y>.1)raised++;
 }
 assert(raised>100);assert(env.group.getObjectByName('MountainRelief'));
 // Slab, ground and mountain relief are the only noninstanced landscape meshes.
 assert.equal(env.group.children.filter(o=>o.isMesh&&!o.isInstancedMesh).length,3);
 const shader={uniforms:{},vertexShader:api.T.ShaderLib.standard.vertexShader,fragmentShader:api.T.ShaderLib.standard.fragmentShader};surface.material.onBeforeCompile(shader);
 assert(shader.fragmentShader.includes('soilSurface(vGroundWorld.xz)'));assert(shader.fragmentShader.includes('fwidth(p)'));assert(shader.uniforms.groundWeights.value.isDataTexture);
 let disposed=false;shader.uniforms.groundWeights.value.addEventListener('dispose',()=>disposed=true);surface.material.dispose();assert(disposed);
});
