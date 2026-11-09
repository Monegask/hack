import fs from 'node:fs/promises';
import path from 'node:path';
import * as T from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createCityHub} from './model.mjs';

// GLTFExporter uses the browser FileReader API only to assemble binary buffers.
globalThis.FileReader=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(value=>{this.result=value;this.onloadend?.();}).catch(error=>this.onerror?.(error));}};
const out=__CITY_OUTPUT_DIR__;
await fs.mkdir(out,{recursive:true});const model=createCityHub(),bytes=await new GLTFExporter().parseAsync(model,{binary:true,onlyVisible:true});
const glbPath=path.join(out,'city-hub.glb');await fs.writeFile(glbPath,Buffer.from(bytes));
// Re-import the exported bytes into a fresh loader before presenting them.
const loaded=await new GLTFLoader().parseAsync(bytes,''),bounds=new T.Box3().setFromObject(loaded.scene),size=bounds.getSize(new T.Vector3());
let meshes=0,triangles=0;loaded.scene.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count||o.geometry.getAttribute('position').count)/3;}});
const report={model:'city-hub.glb',version:3,skill:'Shellishack/3d-web-game-dev-skills/generate-low-poly-model',sourceCommit:'9eae28dd67b146e7a0471bad382b170f76b16935',method:'local procedural 3D, not neural image-to-mesh',bytes:bytes.byteLength,meshes,triangles,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray(),size:size.toArray()},buildings:model.userData.procedural.buildingCount,industries:model.userData.procedural.industries,parking:model.userData.procedural.parking,materials:model.children.map(o=>o.material.name),reimport:'passed',integratedIntoGame:false};
await fs.writeFile(path.join(out,'model-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
