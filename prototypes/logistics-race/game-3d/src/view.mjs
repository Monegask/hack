import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createMintGltfLoader,disposeMintGltfRuntime} from '../../threejs-trial/src/gltf-runtime.ts';
import {articulatePumpjack,PUMP_BASE_PORT} from '../../threejs-trial/src/pumpjack.mjs';
import {repairQuarry} from '../../threejs-trial/src/quarry-repair.mjs';
import {animateQuarry} from '../../threejs-trial/src/quarry-motion.mjs';
import {articulateOreMine} from '../../threejs-trial/src/ore-mine-motion.mjs';
import {buildTruck} from '../../threejs-trial/src/world.mjs';
import {CELL,TRUCK_SCALE,world,cell,visualCell,active,working,advanceClocks,truckPose,hiddenByEnterprise,networkPoint,connectionCell,cameraButtons,canPaintPointer,hubPortal} from './state.mjs';
import {Batch,material,replace,roads,dirt,pipes,parking,outline,plot,hubConnectors} from './geometry.mjs';
import {HUB,placeHub} from './hub-layout.mjs';
import {SITE_LAYOUT} from './site-layout.mjs';
import {createEnvironment} from './environment.mjs';
import {articulateAsphalt} from './asphalt-motion.mjs';
import {TERRITORY_OFFSET,territoryCamera,territoryHeadingPoint,playerGround,overviewLabel} from './territory-layout.mjs';
import {THEME,applyIndustrialPalette,disposeTheme} from './theme.mjs';
import {selectedRoutePoints,activeRoute} from './active-route.mjs';
import {addTruckAccents} from './truck-details.mjs';

function compact(group,exclude=[]){
 group.updateMatrixWorld(true);const inverse=group.matrixWorld.clone().invert(),batches=new Map(),old=[];
 group.traverse(o=>{if(!o.isMesh)return;for(let p=o;p&&p!==group;p=p.parent)if(exclude.includes(p))return;const source=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone(),g=source.applyMatrix4(inverse.clone().multiply(o.matrixWorld));if(!batches.has(o.material))batches.set(o.material,[]);batches.get(o.material).push(g);old.push(o);});
 for(const mesh of old)mesh.removeFromParent();for(const [mat,geometries] of batches){const g=mergeGeometries(geometries);for(const part of geometries)part.dispose();const mesh=new T.Mesh(g,mat);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);}
}
function importModel(asset,width){
 const box=new T.Box3().setFromObject(asset),size=box.getSize(new T.Vector3()),center=box.getCenter(new T.Vector3()),wrapper=new T.Group();wrapper.scale.setScalar(width/Math.max(size.x,size.z));asset.position.set(-center.x,-box.min.y,-center.z);wrapper.add(asset);asset.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});return wrapper;
}
// Parse each asset once; every territory receives independent scene-node clones.
let sharedAssets;
function loadAssets(){return sharedAssets??=(()=>{const loader=createMintGltfLoader();return Promise.all([loader.loadAsync(__PUMP_MODEL_URL__),loader.loadAsync(__MINE_MODEL_URL__),loader.loadAsync(__QUARRY_MODEL_URL__),loader.loadAsync(__CITY_MODEL_URL__),loader.loadAsync(__ASPHALT_MODEL_URL__)]);})();}
export class View{
 constructor(host,callbacks,shared=null,engine=null){
  this.host=host;this.callbacks=callbacks;this.E=engine||globalThis.Logistics;this.models=globalThis.MapScene.models;this.state=null;this.options={};this.clock={};this.sites=new Map();this.trucks=new Map();this.full=false;this.dead=false;this.assetReady=false;this.isCompanion=Boolean(shared);this.owner=shared;this.focus='player';
  if(shared){
   this.renderer=shared.renderer;this.camera=shared.camera;this.scene=new T.Group();this.scene.name='RivalTerritory';this.scene.position.x=this.E.width>16?0:TERRITORY_OFFSET;shared.scene.add(this.scene);
   this.dynamic=new T.Group();this.scene.add(this.dynamic);this.labels=document.createElement('div');this.labels.className='map3d-labels rival-labels';host.append(this.labels);this.loading=document.createElement('div');this.loading.className='map3d-loading rival-loading';this.loading.textContent='Загружаем территорию соперника…';host.append(this.loading);
   this.ray=new T.Raycaster();this.pointer=new T.Vector2();this.buildTerrain();this.buildSites();this.addTerritoryHeading('Соперник');this.load();return;
  }
  host.classList.add('map3d');host.setAttribute('aria-label','Трёхмерная игровая карта: выбрать объект или машину, колесо — масштаб, правая кнопка — сдвиг');host.setAttribute('aria-busy','true');
  this.loading=document.createElement('div');this.loading.className='map3d-loading';this.loading.setAttribute('role','status');this.loading.textContent='Загружаем трёхмерную карту…';host.append(this.loading);
  try{this.renderer=new T.WebGLRenderer({antialias:true});}catch{this.loading.textContent='3D недоступно: включите аппаратное ускорение браузера.';return;}
  const r=this.renderer;r.setPixelRatio(Math.min(devicePixelRatio||1,1.5));r.outputColorSpace=T.SRGBColorSpace;r.toneMapping=T.ACESFilmicToneMapping;r.toneMappingExposure=1.06;r.shadowMap.enabled=true;r.shadowMap.type=T.PCFShadowMap;host.append(r.domElement);
  this.scene=new T.Scene();this.scene.background=new T.Color(THEME.background);this.camera=new T.OrthographicCamera(-25,25,18,-18,.1,600);this.controls=new OrbitControls(this.camera,r.domElement);this.controls.enableDamping=true;this.controls.zoomToCursor=true;this.controls.minZoom=.55;this.controls.maxZoom=4;this.controls.minPolarAngle=.25;this.controls.maxPolarAngle=1.26;this.controls.maxTargetRadius=260;
  this.fit();this.scene.add(new T.HemisphereLight(0xa8c5d7,0x263e37,1.85));const sun=new T.DirectionalLight(0xb9cfde,2.0);sun.position.set(-24,75,40);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-62,right:62,top:52,bottom:-52,near:1,far:150});sun.shadow.camera.updateProjectionMatrix();sun.shadow.bias=-.0002;sun.shadow.normalBias=.012;this.scene.add(sun);this.sun=sun;
  this.dynamic=new T.Group();this.scene.add(this.dynamic);this.labels=document.createElement('div');this.labels.className='map3d-labels';host.append(this.labels);this.ray=new T.Raycaster();this.pointer=new T.Vector2();this.groundPlane=new T.Plane(new T.Vector3(0,1,0),0);this.pointerStart=null;this.lastCell='';
  this.buildTerrain();this.buildSites();this.addTerritoryHeading('Вы');this.bind();this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(host);this.resize();r.setAnimationLoop(()=>this.frame());
  this.load();window.addEventListener('pagehide',()=>this.dispose(),{once:true});
 }
 addTerritoryHeading(text){this.territoryHeading=document.createElement('span');this.territoryHeading.className='map3d-territory-title';this.territoryHeading.textContent=text;this.labels.append(this.territoryHeading);}
 setRivalState(state,extra=0,engine=globalThis.globalRaceWorldEngines?.rival){
  if(this.isCompanion)return;
  if(!state){if(this.rival){this.rival.dispose();this.rival=null;this.focus='player';this.overview=false;this.configureTerritoryLight(false);this.fit();}return;}
  const first=!this.rival;if(first){this.rival=new View(this.host,{},this,engine);this.configureTerritoryLight(true);}
  this.rival.update(state,{extra});if(first)this.focusTerritory('both');
 }
 configureTerritoryLight(dual){if(!this.sun)return;const x=dual?(this.E.width>16?this.E.worldBounds.centerX:TERRITORY_OFFSET/2):0;this.sun.position.set(-24+x,75,40);this.sun.target.position.set(x,0,0);if(!this.sun.target.parent)this.scene.add(this.sun.target);Object.assign(this.sun.shadow.camera,{left:dual?-145:-62,right:dual?145:62,top:dual?96:52,bottom:dual?-96:-52,far:dual?320:150});this.sun.shadow.camera.updateProjectionMatrix();this.sun.target.updateMatrixWorld(true);}
 focusTerritory(mode){if(this.isCompanion||!['player','rival','both'].includes(mode))return false;if(mode!=='player'&&!this.rival)return false;this.focus=mode;this.overview=mode==='both';if(this.rival)this.rival.overview=this.overview;this.full=true;this.fit();return true;}
 fit(){const layout=this.rival||this.E.width>16?territoryCamera(this.focus,this.host.clientWidth/this.host.clientHeight,this.E):null,target=layout?new T.Vector3(layout.target.x,.5,layout.target.z):this.full?new T.Vector3(0,.5,0):new T.Vector3(-7,.5,12);this.controls.target.copy(target);this.camera.position.copy(target).add(layout?.offset?new T.Vector3(layout.offset.x,layout.offset.y,layout.offset.z):this.focus==='both'?new T.Vector3(70,105,95):new T.Vector3(45,66,58));this.camera.zoom=1;this.controls.update();this.resize();}
 frameAll(){if(this.rival){this.focusTerritory(this.focus==='both'?'player':'both');return this.focus==='both';}this.full=!this.full;this.fit();return this.full;}
 makeTutorialRoom(ids,top){const boxes=ids.map(id=>this.projectSite(id)).filter(Boolean);if(!boxes.length)return;const dy=top-Math.min(...boxes.map(b=>b.y));if(dy<=0)return;const units=(this.camera.top-this.camera.bottom)/this.camera.zoom/this.host.clientHeight,shift=new T.Vector3().setFromMatrixColumn(this.camera.matrixWorld,1).multiplyScalar(dy*units);this.camera.position.add(shift);this.controls.target.add(shift);this.controls.update();this.camera.updateMatrixWorld(true);}
 resize(){if(this.isCompanion||!this.renderer)return;const w=this.host.clientWidth,h=this.host.clientHeight;if(!w||!h)return;const aspect=w/h,half=this.rival||this.E.width>16?territoryCamera(this.focus,aspect,this.E).half:this.full?Math.max(46,75/aspect):Math.max(27,43/aspect);Object.assign(this.camera,{left:-half*aspect,right:half*aspect,top:half,bottom:-half});this.camera.updateProjectionMatrix();this.renderer.setSize(w,h);}
 buildTerrain(){
  if(!this.isCompanion){const environment=createEnvironment(this.E,this.models);this.environment=environment;this.scene.add(environment.group);}const b=new Batch();
  for(const [id] of Object.entries(this.E.positions)){if(id==='city'||id==='center')continue;const p=world(visualCell(id,this.E,this.models)),layout=SITE_LAYOUT[id];b.box(layout.width,.025,layout.depth,p.x,.03,p.z,THEME.yard);}
  // Permanent, ground-level loading portals identify the road endpoints.
  for(const id of this.isCompanion&&this.E.width>16?['city']:['city','center']){const p=hubPortal(id,this.E);b.disc(p,.68,.083,0xe8deca);b.disc(p,.47,.096,0x343c37);b.strip({x:p.x-.32,z:p.z},{x:p.x+.32,z:p.z},.10,.11,0xf4ebd7);}
  this.scene.add(b.build());this.scene.add(hubConnectors(this.E,this.isCompanion&&this.E.width>16?['city']:['city','center']));
 }
 buildSites(){
  for(const id of Object.keys(this.E.positions)){
   if(this.isCompanion&&this.E.width>16&&id==='center')continue;
   const root=new T.Group(),p=world(visualCell(id,this.E,this.models));root.position.set(p.x,.042,p.z);root.userData.node=id;this.scene.add(root);
   const {width,depth}=SITE_LAYOUT[id],construction=plot(width,depth),selection=outline(width+.18,depth+.18,0xbe6048);root.add(construction,selection);
   const label=document.createElement('button');label.type='button';label.className='map3d-label';if(this.isCompanion){label.dataset.rivalNode=id;label.addEventListener('pointerdown',event=>event.stopPropagation());}else label.dataset.node=id;label.addEventListener('click',event=>{if(this.isCompanion){event.stopPropagation();if(!this.owner.options.roadMode&&!this.owner.options.pipeMode)this.owner.onRivalSelect?.(id);return;}if(!this.options.roadMode&&!this.options.pipeMode)this.callbacks.onSelect(id);});this.labels.append(label);
   if(id==='city'||id==='center'){const portal=document.createElement('span');portal.className='map3d-portal';portal.textContent=id==='center'?'Въезд в хаб':'Выезд из города';this.labels.append(portal);label.portal=portal;}
   const site={root,construction,selection,label,width,depth,model:null,rig:null,labelPoint:new T.Vector3(p.x,.14,p.z+depth/2+.10),clock:0};this.sites.set(id,site);

  }
 }
 makeSmoke(origin,size=1){const group=new T.Group(),geometry=new T.IcosahedronGeometry(.12*size,1),puffs=Array.from({length:7},()=>{const mesh=new T.Mesh(geometry,new T.MeshStandardMaterial({color:0xb9b9aa,transparent:true,opacity:.30,depthWrite:false,roughness:1}));group.add(mesh);return mesh;});return {group,puffs,origin,size};}
 async load(){
  try{const [pump,mine,quarry,city,asphalt]=await loadAssets();if(this.dead)return;
   for(const id of ['oil','oil2']){const asset=pump.scene.clone(true),rig=articulatePumpjack(asset),site=this.sites.get(id);site.rig=rig;site.model=importModel(asset,SITE_LAYOUT[id].model);site.model.rotation.y=Math.PI/2;site.root.add(site.model);site.root.updateMatrixWorld(true);site.pipeAnchor=asset.localToWorld(new T.Vector3(PUMP_BASE_PORT.x,PUMP_BASE_PORT.y,PUMP_BASE_PORT.z)).sub(this.scene.position);}
   for(const id of ['iron','copper']){const site=this.sites.get(id),asset=mine.scene.clone(true);site.rig=articulateOreMine(asset);site.model=importModel(asset,SITE_LAYOUT[id].model);site.root.add(site.model);}
   const site=this.sites.get('gravel'),asset=quarry.scene.clone(true);site.rig=animateQuarry(repairQuarry(asset));site.model=importModel(asset,SITE_LAYOUT.gravel.model);site.root.add(site.model);
   for(const id of ['city','center']){const site=this.sites.get(id);if(!site)continue;const asset=city.scene.clone(true);site.model=importModel(asset,HUB.width*HUB.scale);site.root.add(site.model);const meta=asset.children[0].userData.procedural,mirror=this.E.hubMirrors?.[id]||false,sign=mirror?-1:1,zsign=mirror==='rotate'?-1:1,at=placeHub(world(this.E.positions[id]),mirror);if(mirror)site.model.scale.x*=-1;if(mirror==='rotate')site.model.scale.z*=-1;
    site.hubBounds=[...meta.buildings,...meta.industries].map(b=>new T.Box3(new T.Vector3(at.x+(sign*b.x-b.width/2-.025)*HUB.scale,0,at.z+(zsign*b.z-b.depth/2-.025)*HUB.scale),new T.Vector3(at.x+(sign*b.x+b.width/2+.025)*HUB.scale,8,at.z+(zsign*b.z+b.depth/2+.025)*HUB.scale)));
   }
   {const site=this.sites.get('asphalt'),asset=asphalt.scene.clone(true);site.rig=articulateAsphalt(asset);site.model=importModel(asset,SITE_LAYOUT.asphalt.model);site.root.add(site.model);site.model.updateMatrixWorld(true);const source=new T.Vector3(...site.rig.meta.smokeOrigin),origin=site.root.worldToLocal(asset.localToWorld(source));site.smoke=this.makeSmoke(origin,1.15);site.root.add(site.smoke.group);}
   for(const site of this.sites.values())if(site.model)applyIndustrialPalette(site.model);
   const anisotropy=Math.min(8,this.renderer.capabilities.getMaxAnisotropy());this.scene.traverse(o=>{if(!o.isMesh)return;for(const m of Array.isArray(o.material)?o.material:[o.material])for(const t of Object.values(m))if(t?.isTexture){t.anisotropy=anisotropy;t.needsUpdate=true;}});
   this.assetReady=true;this.loading.remove();if(!this.isCompanion)this.host.setAttribute('aria-busy','false');
  }catch(error){if(this.dead)return;this.loading.textContent='Не удалось загрузить 3D-модели. Обновите страницу, чтобы повторить.';this.loading.classList.add('error');console.error(error);}
 }
 update(s,options={}){this.state=s;this.options=options;if(this.isCompanion)return;if('rivalState' in options)this.setRivalState(options.rivalState,options.rivalExtra||0);const drawing=Boolean(options.roadMode||options.pipeMode);this.host.classList.toggle('drawing',drawing);for(const site of this.sites.values())site.label.disabled=drawing;if(this.controls){this.controls.enabled=true;this.controls.enableZoom=true;Object.assign(this.controls.mouseButtons,cameraButtons(drawing));}this.host.setAttribute('aria-label',drawing?'Строительство: левая кнопка — рисовать, правая — вращать, средняя — сдвиг, колесо — масштаб':'Трёхмерная игровая карта');}
 frame(){
  if(this.dead||!this.state)return;const s=this.state,o=this.options,clocks=advanceClocks(s,this.clock,o.extra||0);
  const network=JSON.stringify([s.roads,s.pipeCells,this.assetReady,s.sites.oil2.active]);if(network!==this.network){this.network=network;if(!this.isCompanion||this.E.width<=16)replace(this.dynamic,'paid-roads',roads(s,this.E,this.models));replace(this.dynamic,'pipelines',pipes(s,this.E,Object.fromEntries([...this.sites].filter(([,site])=>site.pipeAnchor).map(([id,site])=>[id,site.pipeAnchor]))));}
  const routes=JSON.stringify(s.trucks.map(t=>t.leg?.points||null));if(routes!==this.routes){this.routes=routes;replace(this.dynamic,'active-dirt-tracks',dirt(s,this.E));}
  const building=Boolean(o.roadMode||o.pipeMode);if(String(building)+o.roadMode!==this.building){this.building=String(building)+o.roadMode;replace(this.dynamic,'cell-grid',this.grid(building));}
  if(!this.isCompanion){const points=selectedRoutePoints(s,o.selectedTruck,this.E,this.models,building),key=JSON.stringify(points);if(key!==this.activeRouteKey){this.activeRouteKey=key;replace(this.dynamic,'selected-truck-route',activeRoute(points));this.host.dataset.activeRoutePoints=String(points.length);}this.environment?.updateClearance([{state:s,engine:this.E},...(this.rival?.state?[{state:this.rival.state,engine:this.rival.E}]:[])]);}
  for(const [id,site] of this.sites){const built=active(s,id);site.construction.visible=!built;site.selection.visible=o.selected===id;if(site.model)site.model.visible=built;site.rig?.update(clocks[id]||0);
   if(site.smoke){site.smoke.group.visible=built&&working(s,id);for(const [i,puff] of site.smoke.puffs.entries()){const u=((clocks[id]||0)*.22+i/7)%1;puff.position.copy(site.smoke.origin).add(new T.Vector3(u*.6,u*1.6,Math.sin(i+u*3)*u*.12));puff.scale.setScalar(.6+u*1.8);puff.material.opacity=Math.sin(u*Math.PI)*.34;}}
   const row=s.sites[id],status=id==='city'?'Общий склад и производство':id==='center'&&this.rival?`Вы ${Object.values(s.delivered).reduce((a,b)=>a+b,0)}/26 · Соперник ${Object.values(this.rival.state?.delivered||{}).reduce((a,b)=>a+b,0)}/26`:id==='center'?`${s.delivered.iron}/12 Fe · ${s.delivered.copper}/6 Cu · ${s.delivered.asphalt}/8 асф.`:this.E.siteStatus(s,id),stock=row?.active&&id!=='asphalt'?` · ${row.stock}`:'';
   const brief=this.overview||(this.E.width>16&&this.camera.zoom<1.8),fullText=`${this.E.label(id)}\n${status}${stock?'\nНа складе: '+row.stock:''}`,labelText=brief?overviewLabel(id):fullText;
   if(site.text!==labelText||site.fullText!==fullText){site.text=labelText;site.fullText=fullText;site.label.textContent=labelText;site.label.title=fullText;site.label.setAttribute('aria-label',fullText);site.label.dataset.built=String(built);}
   site.label.classList.toggle('overview',Boolean(brief));site.label.dataset.state=id==='city'?'city':!built?'construction':working(s,id)?'working':'idle';site.label.classList.toggle('selected',o.selected===id);
   if(row?.construction){site.construction.scale.y=1+Math.max(0,2-row.construction.left)*.45;}else site.construction.scale.y=1;
  }
  this.updateTrucks(s,o.extra||0,o.selectedTruck);if(this.isCompanion){this.projectLabels();return;}if(this.rival){this.rival.options.extra=o.extra||0;this.rival.frame();}this.controls.update();this.renderer.render(this.scene,this.camera);if(this.assetReady&&(!this.diagnosticTime||performance.now()-this.diagnosticTime>1000)){this.diagnosticTime=performance.now();this.host.dataset.renderInfo=JSON.stringify({calls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,geometries:this.renderer.info.memory.geometries,textures:this.renderer.info.memory.textures});}this.projectLabels();
 }
 updateTrucks(s,extra,selected){
  const parkingKey=s.trucks.map(t=>t.id).join(',');if(parkingKey!==this.parkingKey){this.parkingKey=parkingKey;replace(this.dynamic,'parking',parking(s.trucks,this.E));}
  const bounds=[];for(const [id,site] of this.sites)if(site.model&&active(s,id)){if(site.hubBounds){bounds.push(...site.hubBounds);continue;}if(!site.trafficBounds){site.root.updateWorldMatrix(true,true);site.trafficBounds=new T.Box3().setFromObject(site.model);site.trafficBounds.translate(this.scene.position.clone().negate());}bounds.push(site.trafficBounds);}
  if(this.isCompanion&&this.E.width>16){const center=this.owner.sites.get('center');if(center?.hubBounds)bounds.push(...center.hubBounds);}
  for(const [id,rig] of this.trucks)if(!s.trucks.some(t=>t.id===id)){rig.group.traverse(o=>{if(o.isMesh)o.geometry.dispose();});rig.group.removeFromParent();this.trucks.delete(id);}
  for(const t of s.trucks){let rig=this.trucks.get(t.id);if(!rig){rig=buildTruck();applyIndustrialPalette(rig.group,{truck:true});addTruckAccents(rig.group);for(const wheel of rig.wheels)compact(wheel);compact(rig.group,rig.wheels);rig.group.scale.setScalar(TRUCK_SCALE);rig.group.userData.truckId=t.id;rig.distance=0;rig.last=null;rig.ring=outline(1.35,.74,THEME.orange);rig.ring.position.y=-.015;rig.group.add(rig.ring);this.scene.add(rig.group);this.trucks.set(t.id,rig);}
   const p=truckPose(s,t,extra,rig.group.rotation.y,this.E,this.models),distance=rig.last?Math.hypot(p.x-rig.last.x,p.z-rig.last.z):0;if(p.moving&&distance<CELL)rig.distance+=p.reverse?-distance:distance;rig.last=p;rig.group.visible=!hiddenByEnterprise(p,bounds);rig.group.position.set(p.x,p.y??.071,p.z);rig.group.rotation.y=p.yaw;for(const wheel of rig.wheels)wheel.rotation.z=-rig.distance/(.18*TRUCK_SCALE);rig.ring.visible=selected===t.id;
  }
 }
 projectSite(id){const site=this.sites.get(id);if(!site)return null;const object=site.model?.visible?site.model:site.construction;object.updateWorldMatrix(true,true);const box=object===site.model?(site.tutorialBounds??=new T.Box3().setFromObject(object)):new T.Box3().setFromObject(object),r=this.host.getBoundingClientRect(),points=[];for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){const p=new T.Vector3(x,y,z).project(this.camera);if(p.z>=-1&&p.z<=1)points.push({x:r.x+(p.x*.5+.5)*r.width,y:r.y+(-p.y*.5+.5)*r.height});}if(!points.length)return null;const xs=points.map(p=>p.x),ys=points.map(p=>p.y);return {x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};}
 projectCell(p,type='road'){const at=type==='pipe'?world(p):networkPoint(p,this.E,this.models),v=new T.Vector3(at.x,.12,at.z).add(this.scene.position).project(this.camera),r=this.host.getBoundingClientRect();return v.z>=-1&&v.z<=1&&Math.abs(v.x)<1&&Math.abs(v.y)<1?{x:r.x+(v.x*.5+.5)*r.width,y:r.y+(-v.y*.5+.5)*r.height}:null;}
 grid(show){const b=new Batch();if(show){
  if(this.options.roadMode){for(let x=0;x<(this.E.width||16);x++)for(let z=0;z<(this.E.height||11);z++){const p=[x,z],at=networkPoint(p,this.E,this.models);if(this.E.mountains.some(q=>q[0]===x&&q[1]===z))continue;b.disc(at,.18,.082,0xb2a892);for(const d of [[1,0],[0,1]]){const q=[x+d[0],z+d[1]];if(this.E.canStep(p,q))b.strip(at,networkPoint(q,this.E,this.models),.014,.08,0xb2a892);}}for(const p of Object.values(this.E.positions)){const at=networkPoint(p,this.E,this.models);b.disc(at,.63,.086,0xbe6048);b.disc(at,.43,.098,0xf5eedf);}}
  else for(let x=0;x<(this.E.width||16);x++)for(let z=0;z<(this.E.height||11);z++){const p=world([x,z]);b.disc({x:p.x,z:p.z+.78},.13,.08,0xb2a892);b.strip({x:p.x-CELL/2,z:p.z-CELL/2},{x:p.x+CELL/2,z:p.z-CELL/2},.014,.08,0xb2a892);b.strip({x:p.x-CELL/2,z:p.z-CELL/2},{x:p.x-CELL/2,z:p.z+CELL/2},.014,.08,0xb2a892);}
 }return b.build();}

 projectLabels(){const w=this.host.clientWidth,h=this.host.clientHeight;for(const [id,site] of this.sites){const p=site.labelPoint.clone().add(this.scene.position).project(this.camera);site.label.style.left=(p.x*.5+.5)*w+'px';site.label.style.top=(-p.y*.5+.5)*h+'px';site.label.hidden=p.z<-1||p.z>1||Math.abs(p.x)>1.2||Math.abs(p.y)>1.2;
  if(site.label.portal){const at=hubPortal(id,this.E),q=new T.Vector3(at.x,.2,at.z).add(this.scene.position).project(this.camera),el=site.label.portal;el.style.left=(q.x*.5+.5)*w+'px';el.style.top=(-q.y*.5+.5)*h+'px';el.hidden=!this.options.roadMode||q.z<-1||q.z>1;}
 }if(this.territoryHeading){const anchor=territoryHeadingPoint(this.E,this.isCompanion,this.scene.position.x),p=new T.Vector3(anchor.x,anchor.y,anchor.z).project(this.camera),el=this.territoryHeading;el.style.left=(p.x*.5+.5)*w+'px';el.style.top=(-p.y*.5+.5)*h+'px';el.hidden=p.z<-1||p.z>1||Math.abs(p.x)>1.2||Math.abs(p.y)>1.2;} }

 rayAt(x,y){const rect=this.renderer.domElement.getBoundingClientRect();if(x<rect.left||x>rect.right||y<rect.top||y>rect.bottom)return false;this.pointer.set((x-rect.left)/rect.width*2-1,-(y-rect.top)/rect.height*2+1);this.ray.setFromCamera(this.pointer,this.camera);return true;}
 hitAt(x,y,truck=true){if(!this.rayAt(x,y))return null;const roots=[...this.sites.values()].map(s=>s.root);if(truck)roots.push(...[...this.trucks.values()].map(t=>t.group));for(const hit of this.ray.intersectObjects(roots,true)){let id=null,truckId=null,visible=true;for(let p=hit.object;p;p=p.parent){if(!p.visible)visible=false;id??=p.userData.node;truckId??=p.userData.truckId;}if(visible&&(id||truckId))return {id,truckId};}return null;}
 nodeAt(x,y){if(this.options.roadMode||this.options.pipeMode)return null;return this.hitAt(x,y,false)?.id||null;}
 cellAt(x,y){if(!this.rayAt(x,y))return null;const hit=this.options.roadMode?this.hitAt(x,y,false):null;if(hit?.id)return [...this.E.positions[hit.id]];const point=new T.Vector3();if(!this.ray.ray.intersectPlane(this.groundPlane,point)||!playerGround(point,this.E))return null;// Snap the whole visible yard to its authoritative connection cell.
  return this.options.roadMode?connectionCell(point,this.E,this.models,SITE_LAYOUT):cell(point.x,point.z);}
 paint(e){const p=this.cellAt(e.clientX,e.clientY);if(!p)return;const k=p.join(',');if(k===this.lastCell)return;this.lastCell=k;this.callbacks.onCell(p);}
 bind(){
  const canvas=this.renderer.domElement;
  canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;this.pointerStart=[e.clientX,e.clientY];if(canPaintPointer(e,this.options.roadMode||this.options.pipeMode)){this.drawing=true;this.lastCell='';canvas.setPointerCapture(e.pointerId);this.paint(e);}});
  canvas.addEventListener('pointermove',e=>{if(this.drawing)this.paint(e);});
  canvas.addEventListener('pointerup',e=>{if(this.drawing){this.drawing=false;this.pointerStart=null;this.callbacks.onBuildEnd();return;}if(!this.options.roadMode&&!this.options.pipeMode&&this.pointerStart&&Math.hypot(e.clientX-this.pointerStart[0],e.clientY-this.pointerStart[1])<5){const hit=this.hitAt(e.clientX,e.clientY);if(hit?.truckId)this.callbacks.onTruck(hit.truckId);else if(hit?.id)this.callbacks.onSelect(hit.id);else {const rivalHit=this.rival?.hitAt(e.clientX,e.clientY,false);if(rivalHit?.id)this.onRivalSelect?.(rivalHit.id);}}this.pointerStart=null;});
  canvas.addEventListener('pointercancel',()=>{this.drawing=false;this.pointerStart=null;this.callbacks.onBuildEnd();});
 }
 dispose(){if(this.dead)return;this.dead=true;if(this.isCompanion){this.labels?.remove();this.loading?.remove();this.scene?.removeFromParent();return;}this.rival?.dispose();this.labels?.remove();this.loading?.remove();this.resizeObserver?.disconnect();this.renderer?.setAnimationLoop(null);this.controls?.dispose();disposeMintGltfRuntime();this.scene?.traverse(o=>{if(o.isMesh||o.isLine){o.geometry.dispose();if(o.name==='MountainRelief'||o.isLine)o.material.dispose();}});disposeTheme();this.renderer?.dispose();}
}
globalThis.Map3D={View};
