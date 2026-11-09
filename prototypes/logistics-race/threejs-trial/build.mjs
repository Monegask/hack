import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'..'),dist=path.join(root,'dist'),out=path.join(dist,'threejs-trial');
const registry=JSON.parse(await fs.readFile(path.join(root,'mint-assets.json'),'utf8'));
if(!registry.mintProject?.projectId)throw Error('Missing Mint Project association');
async function readModel(key){
const asset=registry.assets[key],artifact=Object.values(asset?.artifacts||{}).find(a=>a.role==='canonical_model'&&a.format==='glb');
if(!artifact)throw Error('Mint GLB has not been synchronized: '+key);
const modelPath=path.resolve(root,artifact.localPath),relative=path.relative(root,modelPath);
if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('Model outside project');
const bytes=await fs.readFile(modelPath);
if(bytes.toString('ascii',0,4)!=='glTF'||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)throw Error('Invalid GLB');
const gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString().trim());
if((gltf.extensionsRequired||[]).some(x=>!['KHR_draco_mesh_compression','KHR_texture_transform','KHR_materials_unlit','KHR_mesh_quantization'].includes(x)))throw Error('Unsupported required glTF extension');
const meshes=gltf.meshes||[],triangles=meshes.flatMap(m=>m.primitives).reduce((n,p)=>n+(gltf.accessors[p.indices]?.count||gltf.accessors[p.attributes.POSITION]?.count||0)/3,0);
const standalone=!(artifact.usesDraco||artifact.usesMeshopt||artifact.usesKtx2)&&!(gltf.buffers||[]).some(b=>b.uri&&!b.uri.startsWith('data:'))&&!(gltf.images||[]).some(i=>i.uri&&!i.uri.startsWith('data:'));
return {key,bytes,standalone,url:'./'+path.relative(dist,modelPath).replaceAll('\\','/'),report:{modelBytes:bytes.length,modelTriangles:triangles,modelTextures:gltf.textures?.length||0,modelMaterials:gltf.materials?.length||0,meshCount:meshes.length,nodeCount:gltf.nodes?.length||0,animationClips:gltf.animations?.length||0,extensionsUsed:gltf.extensionsUsed||[],extensionsRequired:gltf.extensionsRequired||[],sha256:createHash('sha256').update(bytes).digest('hex')}};
}
const models={factory:await readModel('trial-factory'),pumpjack:await readModel('oil-pumpjack'),quarry:await readModel('gravel-quarry'),metal:await readModel('metalworks'),mine:await readModel('ore-mine')};
if(registry.assets['trial-factory'].source.assetId!=='ks704qy01na3mdh2hxq61ras1s8hg3j7')throw Error('Factory repair is bound to Mint v2. Update the repair before replacing this source.');
if(registry.assets['oil-pumpjack'].source.assetId!=='ks78m0mv3r9g9mw3dh94pmqcb18hh9jx')throw Error('Pump rig is bound to the original Mint pumpjack; update articulation before replacing its source.');
if(registry.assets['gravel-quarry'].source.assetId!=='ks71ya4szhz6fzct6s2vdpm89d8hh2sh')throw Error('Quarry repair is bound to its original Mint asset; update surface annotations and conveyor alignment before replacing it.');
if(registry.assets.metalworks.source.assetId!=='ks7e82a7qdq3f7cwgw9sc63n118hkt7n')throw Error('Metalworks palette is bound to its original Mint asset; update spatial paint regions before replacing it.');
const defines=offline=>Object.fromEntries(Object.entries(models).map(([key,model])=>['__'+key.toUpperCase()+'_MODEL_URL__',JSON.stringify(offline?'data:model/gltf-binary;base64,'+model.bytes.toString('base64'):model.url)]));
await fs.mkdir(out,{recursive:true});
const shared={entryPoints:[path.join(here,'src/main.mjs')],bundle:true,format:'iife',platform:'browser',target:'es2022',minify:true,legalComments:'eof',logLevel:'warning'};
await build({...shared,outfile:path.join(out,'scene.js'),define:defines(false)});
const index=await fs.readFile(path.join(here,'index.html'),'utf8'),css=await fs.readFile(path.join(here,'style.css'),'utf8');
await fs.writeFile(path.join(out,'style.css'),css);await fs.writeFile(path.join(dist,'threejs-trial.html'),index);
// The original GLB has no compression extension: its buffers and textures are embedded.
// Keep the offline artifact genuinely standalone. Future compressed assets need vendored decoders.
let offlinePath=null;
if(Object.values(models).every(model=>model.standalone)){
 const result=await build({...shared,write:false,define:defines(true)});
 const js=result.outputFiles[0].text.replaceAll('</script','<\\/script');
 const offline=index.replace('<link rel="stylesheet" href="./threejs-trial/style.css">',`<style>${css}</style>`).replace('<script type="module" src="./threejs-trial/scene.js"></script>',()=>`<script>${js}</script>`);
 offlinePath=path.join(root,'logistics-race-threejs-trial.html');await fs.writeFile(offlinePath,offline);
}
const report={models:Object.fromEntries(Object.entries(models).map(([key,model])=>[key,model.report])),factoryRuntimeEdit:{role:'Assembly workshop; former generic factory label retained only in internal source keys',module:'src/factory-repair.mjs',sourceStatsAbove:true,changes:'Clip rejected roof and bowed front, add closed flat roof and aligned doors; clean chimney-side baked roof marks. Original GLB unchanged.'},pumpjackRuntimeEdit:{module:'src/pumpjack.mjs',sourceStatsAbove:true,changes:'Partition original GLB into stationary frame and moving beam/horsehead, replace fused crank/links/rod with articulated joints; exact planar four-bar closure, 4-second cycle, through-pins, one continuous black solid well rod inserted into the repaired closed orange horsehead, no cable stub, removed fused rod and baked stripe, outside narrow pitmans with counterweight clearance, fixed wellhead insertion and moving underside braces. Original GLB unchanged.'},quarryRuntimeEdit:{module:'src/quarry-repair.mjs',sourceStatsAbove:true,changes:'Preserved heap vertices with metric UVs and procedural grain normal/roughness maps, two material batches; closed belt with contacting rollers, chassis, supports and crusher feed lip snapped to retained geometry; heap discharge chute removed; screen gravel recolored gray. Original GLB unchanged.'},quarryRuntime:{module:'src/quarry-motion.mjs',changes:'Imported flywheels partitioned from fixed shell; moving closed belt joints and rollers, gravel transport/drop, toothed crushing roll, reciprocating jaw and vibrating screen. Dedicated quarry clock and run/stop control; no change to extraction economy.'},metalworksRuntime:{module:'src/metalworks.mjs + src/metalworks-repair.mjs + src/metalworks-motion.mjs',changes:'Static Mint model for inspection. Retained furnace, pipes and rolling equipment receive clean palette and creased normals. Warped hall/canopy, base and low stock are clipped away and replaced locally: closed aligned hall, seamed flat roof with vents, framed windows and shutter, full-footprint ground-contact foundation, two 3/2/1 piles of tapered ingots. Rolling line is neutral metal gray; rejected fused roll cores are replaced by six independently rotating gray rolls. Chimney smoke emits from retained furnace mouth. Dedicated production clock/run-stop control and global pause/speed; details merged by material. Rear curb cap recolored ivory; rejected foreground curb removed; gray fixed bearing stands aligned to left roller ends. Original GLB unchanged; no economy changes.'},mineRuntime:{role:'Shared iron and copper ore mine',changes:'Original Mint GLB rendered as delivered, static inspection stage, full footprint normalized to the site surface. No gameplay/economy changes.'},entry:'dist/threejs-trial.html',offline:offlinePath?path.basename(offlinePath):null,browserQA:'not run for revised assets',mobileQA:'not run'};
await fs.writeFile(path.join(here,'build-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
