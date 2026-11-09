import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createMintGltfLoader,disposeMintGltfRuntime} from './gltf-runtime.ts';
import {advanceTransport,initialTransport,lanePose,WHEEL_RADIUS} from './motion.mjs';
import {createRoute,buildGround,buildTruck,mat,C,SITE_SURFACE_Y} from './world.mjs';
import {repairFactory} from './factory-repair.mjs';
import {articulatePumpjack} from './pumpjack.mjs';
import {repairQuarry} from './quarry-repair.mjs';
import {animateQuarry} from './quarry-motion.mjs';
import {finishMetalworks} from './metalworks.mjs';
import {animateMetalworks} from './metalworks-motion.mjs';

const $=id=>document.getElementById(id),status=$('status');let fatal=false,ready=false,paused=false,working=true,oilWorking=true,quarryWorking=true,metalWorking=true,quarryView=false,metalView=false,siteIndex=0,speed=1,elapsed=0,oilElapsed=0,quarryElapsed=0,metalElapsed=0,pumpRig=null,quarryMotion=null,metalMotion=null,factoryWrapper=null,quarryWrapper=null,metalWrapper=null,mineWrapper=null,transport=initialTransport();
const route=createRoute(),routeLength=route.getLength(),scene=new T.Scene();scene.background=new T.Color(0xf1eadb);
let renderer;
try{renderer=new T.WebGLRenderer({antialias:true,alpha:false});}catch{fail('Не удалось включить 3D. Проверьте аппаратное ускорение браузера.');}
function fail(message){fatal=true;status.textContent=message;$('retry').hidden=false;}
async function boot(){
 if(!renderer)return;
 renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;
 $('view').append(renderer.domElement);renderer.domElement.setAttribute('aria-label','Трёхмерная карта с промышленными предприятиями, работающей скважиной и транспортом');
 const camera=new T.OrthographicCamera(-12,12,7,-7,.1,100);camera.position.set(13,12,15);
 const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,.5,0);controls.enableDamping=true;controls.minPolarAngle=.3;controls.maxPolarAngle=1.3;controls.minZoom=.6;controls.maxZoom=2.8;controls.maxTargetRadius=8;controls.update();controls.saveState();
 const ambient=new T.HemisphereLight(0xfff7e8,0xa5a38d,2.0);scene.add(ambient);
 const sun=new T.DirectionalLight(0xfff5df,2.8);sun.position.set(-5,14,8);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-11,right:11,top:9,bottom:-9,near:1,far:35});sun.shadow.camera.updateProjectionMatrix();sun.shadow.bias=-.00015;sun.shadow.normalBias=.025;scene.add(sun);
 const siteProps=buildGround(scene,route);const truck=buildTruck();scene.add(truck.group);
 const smokeOrigin=new T.Vector3(0,3,0),smoke=new T.Group();scene.add(smoke);
 const smokeMaterial=new T.MeshStandardMaterial({color:0xe2ddce,transparent:true,opacity:.4,depthWrite:false,roughness:1});
 const smokePuffs=Array.from({length:7},()=>{const puff=new T.Mesh(new T.IcosahedronGeometry(.15,0),smokeMaterial.clone());smoke.add(puff);return puff;});
 function resize(){const width=window.innerWidth,height=window.innerHeight,aspect=width/height,half=Math.max(7,11/aspect);camera.left=-half*aspect;camera.right=half*aspect;camera.top=half;camera.bottom=-half;camera.updateProjectionMatrix();renderer.setSize(width,height);}
 window.addEventListener('resize',resize);resize();
 let last=performance.now(),wheelDistance=0,lastPosition=null,previousYaw=0;
 function buttons(){ $('pause').textContent=paused?'Продолжить':'Пауза';$('production').textContent=working?'Мастерская: работает':'Мастерская: остановлена';$('production').setAttribute('aria-pressed',String(working));$('production').hidden=siteIndex!==0;$('quarry').hidden=!quarryView;$('metal').hidden=!metalView;$('metal').textContent=metalWorking?'Завод: работает':'Завод: остановлен';$('metal').setAttribute('aria-pressed',String(metalWorking));$('quarry').textContent=quarryWorking?'Карьер: работает':'Карьер: остановлен';$('quarry').setAttribute('aria-pressed',String(quarryWorking));$('site').textContent=['Площадка: мастерская','Площадка: карьер','Площадка: металлургия','Площадка: рудник'][siteIndex];$('oil').textContent=oilWorking?'Скважина: работает':'Скважина: остановлена';$('oil').setAttribute('aria-pressed',String(oilWorking));$('speed').textContent=speed+'×';}
 $('pause').onclick=()=>{paused=!paused;buttons();};$('production').onclick=()=>{working=!working;buttons();};$('speed').onclick=()=>{speed=speed===1?2:speed===2?4:1;buttons();};$('camera').onclick=()=>controls.reset();
 $('oil').onclick=()=>{oilWorking=!oilWorking;buttons();};
 $('quarry').onclick=()=>{quarryWorking=!quarryWorking;buttons();};
 $('metal').onclick=()=>{metalWorking=!metalWorking;metalMotion?.update(metalElapsed,metalWorking);buttons();};
 $('site').onclick=()=>{siteIndex=(siteIndex+1)%4;quarryView=siteIndex===1;metalView=siteIndex===2;factoryWrapper.visible=siteIndex===0;quarryWrapper.visible=quarryView;metalWrapper.visible=metalView;mineWrapper.visible=siteIndex===3;siteProps.visible=siteIndex===0;truck.group.visible=siteIndex===0;$('laps').hidden=siteIndex!==0;buttons();};
 $('reset').onclick=()=>{transport=initialTransport();elapsed=0;oilElapsed=0;quarryElapsed=0;metalElapsed=0;metalWorking=true;metalMotion?.update(0,true);pumpRig?.update(0);quarryMotion?.update(0);wheelDistance=0;lastPosition=null;working=true;oilWorking=true;quarryWorking=true;paused=false;speed=1;buttons();};
 document.addEventListener('visibilitychange',()=>{if(document.hidden){paused=true;buttons();}});$('retry').onclick=()=>location.reload();buttons();
 function render(now){
  const delta=Math.min(.05,Math.max(0,(now-last)/1000));last=now;const dt=ready&&!paused?delta*speed:0;
  if(dt){elapsed+=dt;if(oilWorking)oilElapsed+=dt;if(quarryView&&quarryWorking)quarryElapsed+=dt;if(metalView&&metalWorking)metalElapsed+=dt;if(siteIndex===0)transport=advanceTransport(transport,dt,{length:routeLength,working});}
  pumpRig?.update(oilElapsed);
  if(quarryView)quarryMotion?.update(quarryElapsed);
  if(metalView)metalMotion?.update(metalElapsed,metalWorking);
  const t=transport.distance/routeLength,p=route.getPointAt(t),tangent=route.getTangentAt(t),pose=lanePose(p,tangent);
  truck.group.position.set(pose.x,.085,pose.z);truck.group.rotation.y=pose.yaw;
  if(lastPosition&&dt)wheelDistance+=Math.hypot(pose.x-lastPosition.x,pose.z-lastPosition.z);lastPosition=pose;
  for(const wheel of truck.wheels)wheel.rotation.z=-wheelDistance/WHEEL_RADIUS;
  if(dt){const turn=Math.atan2(Math.sin(pose.yaw-previousYaw),Math.cos(pose.yaw-previousYaw));for(const hub of truck.steering)hub.rotation.y=transport.waiting>0?0:T.MathUtils.clamp(turn*6,-.25,.25);previousYaw=pose.yaw;}
  for(let i=0;i<smokePuffs.length;i++){const puff=smokePuffs[i],u=(elapsed*.22+i/smokePuffs.length)%1;puff.visible=ready&&working&&siteIndex===0;puff.position.copy(smokeOrigin).add(new T.Vector3(u*.65,u*1.7,Math.sin(i+u*3)*.10));puff.scale.setScalar(.7+u*1.7);puff.material.opacity=(1-u)*.33;}
  $('laps').textContent='Рейсы: '+transport.laps;
  if(ready&&!fatal)status.textContent=paused?'Пауза':metalView?(metalWorking?'Металлургический завод · прокат и плавка':'Металлургический завод остановлен'):quarryView?(quarryWorking?'Добыча щебня · дробилка и конвейер':'Карьер остановлен'):siteIndex===3?'Железно-медный рудник · осмотр':transport.waiting>0?(working?'Погрузка у сборочной мастерской':'Машина ожидает запуска мастерской'):'Перевозка · мышь — поворот, колесо — масштаб';
  controls.update();renderer.render(scene,camera);
  window.__THREE_GAME_DIAGNOSTICS__={ready,paused,working,laps:transport.laps,position:truck.group.position.toArray(),yaw:pose.yaw,renderer:{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures},basis:{up:'+Y',truckForward:'+X'},assetLoaded:ready};
 }
 renderer.setAnimationLoop(render);
 function placeModel(gltf,width,x,z,yaw=0,groundY=.085){
  const asset=gltf.scene,bounds=new T.Box3().setFromObject(asset),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3());
  if(!(size.x>0&&size.y>0&&size.z>0))throw Error('Пустая промышленная модель');
  const wrapper=new T.Group();wrapper.scale.setScalar(width/Math.max(size.x,size.z));asset.position.set(-center.x,-bounds.min.y,-center.z);wrapper.add(asset);wrapper.position.set(x,groundY,z);wrapper.rotation.y=yaw;
  const anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  asset.traverse(object=>{if(!object.isMesh)return;object.castShadow=true;object.receiveShadow=true;for(const material of (Array.isArray(object.material)?object.material:[object.material]))for(const value of Object.values(material))if(value?.isTexture){value.anisotropy=anisotropy;value.needsUpdate=true;}});
  scene.add(wrapper);wrapper.updateMatrixWorld(true);return wrapper;
 }
 try{
  const loader=createMintGltfLoader(),[factory,pumpjack,quarry,metal,mine]=await Promise.all([loader.loadAsync(__FACTORY_MODEL_URL__),loader.loadAsync(__PUMPJACK_MODEL_URL__),loader.loadAsync(__QUARRY_MODEL_URL__),loader.loadAsync(__METAL_MODEL_URL__),loader.loadAsync(__MINE_MODEL_URL__)]);if(fatal)return;
  repairFactory(factory.scene);
  const wrapper=placeModel(factory,4.6,-1.7,0);factoryWrapper=wrapper;
  quarryMotion=animateQuarry(repairQuarry(quarry.scene));
  quarryWrapper=placeModel(quarry,4.6,-1.7,0);quarryWrapper.visible=false;
  finishMetalworks(metal.scene);metalWrapper=placeModel(metal,4.6,-1.7,0,0,SITE_SURFACE_Y-.001);metalWrapper.visible=false;metalMotion=animateMetalworks(metal.scene);
  mineWrapper=placeModel(mine,4.6,-1.7,0,0,SITE_SURFACE_Y-.001);mineWrapper.visible=false;
  pumpRig=articulatePumpjack(pumpjack.scene);
  placeModel(pumpjack,2.9,3,-.2,Math.PI/2);
  // Find the actual chimney's highest vertices instead of assuming a fixed model scale.
  const top=new T.Box3().setFromObject(wrapper).max.y,point=new T.Vector3(),sum=new T.Vector3();let count=0;
  wrapper.traverse(object=>{if(!object.isMesh)return;const pos=object.geometry.getAttribute('position');for(let i=0;i<pos.count;i++){point.fromBufferAttribute(pos,i).applyMatrix4(object.matrixWorld);if(point.y>=top-.06){sum.add(point);count++;}}});
  if(count)smokeOrigin.copy(sum.divideScalar(count));else smokeOrigin.set(-1.7,top,0);
  ready=true;for(const button of document.querySelectorAll('button:not(#retry)'))button.disabled=false;
 }catch(error){console.error(error);fail('Не удалось загрузить промышленные модели. Нажмите «Повторить».');}
 window.addEventListener('pagehide',()=>{renderer.setAnimationLoop(null);controls.dispose();disposeMintGltfRuntime();renderer.dispose();},{once:true});
}
boot().catch(error=>{console.error(error);fail('Не удалось открыть 3D-сцену. Нажмите «Повторить».');});

