import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {build} from '../../threejs-trial/node_modules/esbuild/lib/main.js';
import * as T from '../../threejs-trial/node_modules/three/build/three.module.js';
import E from '../../dist/engine.js';
import RaceWorld from '../../dist/race-world.js';
import {truckPose,parkingSlot} from '../src/state.mjs';
import {hubApproach} from '../src/hub-layout.mjs';
import MapScene from '../../dist/map-scene.js';
import {TERRITORY_OFFSET,territoryCamera,territoryHeadingPoint,playerGround,projectTerritoryPoint} from '../src/territory-layout.mjs';

function element(){return {children:[],style:{},dataset:{},events:{},classList:{add(){},toggle(){}},setAttribute(){},append(...items){this.children.push(...items);},addEventListener(name,handler){(this.events[name]??=[]).push(handler);},remove(){this.removed=true;},clientWidth:1200,clientHeight:700};}
const bundle=await build({entryPoints:[fileURLToPath(new URL('../src/view.mjs',import.meta.url))],nodePaths:[fileURLToPath(new URL('../../threejs-trial/node_modules',import.meta.url))],bundle:true,format:'iife',platform:'browser',write:false,logLevel:'silent',define:Object.fromEntries(['PUMP','MINE','QUARRY','CITY','ASPHALT'].map(id=>['__'+id+'_MODEL_URL__','"unused-test.glb"']))});
const context=vm.createContext({console,document:{createElement:element},Logistics:E,MapScene,URL,TextDecoder,TextEncoder,performance});vm.runInContext(bundle.outputFiles[0].text,context);const View=context.Map3D.View;
View.prototype.load=async function(){this.assetReady=false;};
function setup(){const host=element(),renderer={info:{render:{calls:0,triangles:0},memory:{geometries:0,textures:0}},renders:0,loops:0,render(){this.renders++;},setAnimationLoop(){this.loops++;},setSize(){},capabilities:{getMaxAnisotropy:()=>1}},shared={renderer,camera:new T.OrthographicCamera(-100,100,70,-70,.1,600),scene:new T.Scene()};return {host,renderer,shared};}

test('Rotated rival hub keeps every stall and approach attached under a half-turn',()=>{
 const w=RaceWorld.create(42),a={x:-39,z:-6},b={x:153,z:6};
 for(let id=1;id<=24;id++){
  const left=hubApproach(a,id),right=hubApproach(b,id,'rotate');assert.equal(left.length,right.length);
  for(let i=0;i<left.length;i++){assert(Math.abs(left[i].x+right[i].x-114)<1e-8);assert(Math.abs(left[i].z+right[i].z)<1e-8);}
  if(id<=8){const p=parkingSlot(id,w.player),q=parkingSlot(id,w.rival);assert(Math.abs(p.x+q.x-114)<1e-8);assert(Math.abs(p.z+q.z)<1e-8);}
 }
});

test('Territory titles sit outside their end of the board on its centre line',()=>{
 const w=RaceWorld.create(42),a=territoryHeadingPoint(w.player),b=territoryHeadingPoint(w.rival,true);
 assert(a.x<w.player.worldBounds.minX);assert(b.x>w.player.worldBounds.maxX);assert.equal(a.z,0);assert.equal(b.z,0);
 assert.deepEqual(territoryHeadingPoint(E,true,116),{x:116,y:1,z:-34});
});

test('Shared board camera looks lengthwise from the player city, with the right passage on screen right',()=>{
 const w=RaceWorld.create(42),layout=territoryCamera('both',1.5,w.player),target=new T.Vector3(layout.target.x,layout.target.y,layout.target.z),camera=new T.OrthographicCamera(-layout.half*1.5,layout.half*1.5,layout.half,-layout.half,.1,600);
 camera.position.copy(target).add(new T.Vector3(layout.offset.x,layout.offset.y,layout.offset.z));camera.lookAt(target);camera.updateMatrixWorld();
 const point=p=>new T.Vector3((p[0]-7.5)*6,0,(p[1]-5)*6).project(camera),a=point(w.player.positions.city),b=point(w.rival.positions.city);
 assert(Math.abs(a.x-b.x)<.15);assert(a.y<b.y);assert(point([9,9]).x>point([9,0]).x);assert(Math.abs(a.y)<1&&Math.abs(b.y)<1);
 assert(w.player.mountainPeaks.length>32);assert(w.player.mountainPeaks.some(p=>p.height>6));
});

test('Both territories show independent real state and clocks without touching either simulation',()=>{
 const {host,shared,renderer}=setup(),a=new View(host,{},shared),b=new View(host,{},shared),player=E.create(),rival=E.create();
 player.paused=false;rival.paused=false;rival.time=20;rival.sites.iron.active=true;rival.sites.iron.mining={left:4};rival.roads=['2,7','1,7'];rival.sites.iron.stock=7;
 const before=JSON.stringify([player,rival]);a.update(player);b.update(rival);a.frame();b.frame();rival.time+=1;const advanced=JSON.stringify([player,rival]);b.frame();a.frame();assert.equal(JSON.stringify([player,rival]),advanced);assert.equal(a.state,player);assert.equal(b.state,rival);assert.equal(a.clock.values.iron,0);assert.equal(b.clock.values.iron,1);assert.equal(a.sites.get('iron').construction.visible,true);assert.equal(b.sites.get('iron').construction.visible,false);assert(b.sites.get('iron').label.textContent.includes('7'));assert(a.dynamic.getObjectByName('paid-roads')!==b.dynamic.getObjectByName('paid-roads'));assert(a.trucks.get(1)!==b.trucks.get(1));assert.equal(renderer.loops,0);assert.equal(renderer.renders,0);assert.equal(a.scene.position.x,TERRITORY_OFFSET);assert.notEqual(before,advanced);
});

test('One frame updates both territories and renders exactly once through the shared renderer',()=>{
 const {host,shared,renderer}=setup(),primary=new View(host,{},shared),rival=new View(host,{},shared);primary.isCompanion=false;primary.rival=rival;primary.controls={update(){},mouseButtons:{}};primary.update(E.create());rival.update(E.create());primary.frame();assert.equal(renderer.renders,1);assert.equal(renderer.loops,0);assert.equal(primary.renderer,rival.renderer);assert.equal(primary.camera,rival.camera);
});

test('Read-only rival lifecycle does not dispose the shared renderer or replace player state',()=>{
 const {host,shared,renderer}=setup(),primary=new View(host,{},shared),player=E.create(),rival=E.create();primary.isCompanion=false;primary.state=player;primary.controls={target:new T.Vector3(),update(){}};primary.setRivalState(rival);assert.equal(primary.state,player);assert.equal(primary.rival.state,rival);assert.equal(primary.focus,'both');const companion=primary.rival;primary.setRivalState(null);assert.equal(primary.rival,null);assert.equal(primary.state,player);assert(companion.dead);assert.equal(companion.scene.parent,null);assert.equal(renderer.loops,0);assert.equal(renderer.renders,0);
});

test('Rival ground coordinates cannot paint player roads and the camera has explicit territory framing',()=>{
 const p={x:12,z:7},shifted=projectTerritoryPoint(p,true);assert(playerGround(p));assert(!playerGround(shifted));assert.deepEqual(p,{x:12,z:7});assert.equal(territoryCamera('both',1.5).target.x,TERRITORY_OFFSET/2);assert.equal(territoryCamera('rival',1.5).target.x,TERRITORY_OFFSET);assert.equal(territoryCamera('player',1.5).target.x,0);assert(territoryCamera('both',1.5).half>territoryCamera('player',1.5).half);
 const {host,shared}=setup(),primary=new View(host,{},shared);primary.isCompanion=false;primary.groundPlane=new T.Plane(new T.Vector3(0,1,0),0);primary.options={roadMode:true};primary.rayAt=()=>true;primary.hitAt=()=>null;primary.ray={ray:{intersectPlane:(plane,out)=>out.set(shifted.x,0,shifted.z)}};assert.equal(primary.cellAt(100,100),null);
});


test('Rival labels open only rival information and never advertise player selection attributes',()=>{
 const {host,shared}=setup();let opened=null,playerSelections=0;shared.options={};shared.onRivalSelect=id=>{opened=id;};const rival=new View(host,{onSelect(){playerSelections++;}},shared),label=rival.sites.get('iron').label;assert.equal(label.dataset.node,undefined);assert.equal(label.dataset.rivalNode,'iron');label.events.click[0]({stopPropagation(){}});assert.equal(opened,'iron');assert.equal(playerSelections,0);opened=null;shared.options.roadMode=true;label.events.click[0]({stopPropagation(){}});assert.equal(opened,null);
});

test('One directional shadow map covers both territories without introducing a second light',()=>{
 const {host,shared}=setup(),primary=new View(host,{},shared);primary.isCompanion=false;primary.sun=new T.DirectionalLight();primary.scene.add(primary.sun);primary.configureTerritoryLight(true);assert.equal(primary.sun.target.position.x,TERRITORY_OFFSET/2);assert(primary.sun.shadow.camera.right>=TERRITORY_OFFSET);primary.configureTerritoryLight(false);assert.equal(primary.sun.target.position.x,0);assert.equal(primary.sun.shadow.camera.right,62);let lights=0;primary.scene.traverse(o=>{if(o.isDirectionalLight)lights++;});assert.equal(lights,1);
});


test('Overview shows short one-line labels with full status retained, and focus restores full detail',()=>{
 const {host,shared}=setup(),primary=new View(host,{},shared);primary.isCompanion=false;primary.controls={target:new T.Vector3(),update(){},mouseButtons:{}};const player=E.create(),rival=E.create();rival.sites.iron.active=true;rival.sites.iron.stock=7;primary.update(player);primary.setRivalState(rival);primary.frame();const a=primary.sites.get('iron').label,b=primary.rival.sites.get('iron').label;assert.equal(a.textContent,'Iron');assert.equal(b.textContent,'Iron');assert(!b.textContent.includes('\n'));assert(b.title.includes('7'));assert.equal(b.dataset.state,'idle');primary.focusTerritory('rival');primary.frame();assert(b.textContent.includes('\n'));assert(b.textContent.includes('7'));assert.equal(primary.overview,false);assert.equal(primary.rival.overview,false);
});


test('Common world renders one continuous ground and one center with independently positioned real bases',()=>{
 const {host,shared}=setup(),world=RaceWorld.create(),player=world.player.create(),rival=world.rival.create();player.roads=rival.roads=[];
 const primary=new View(host,{},shared,world.player);primary.isCompanion=false;primary.scene.clear();primary.sites.clear();primary.dynamic=new T.Group();primary.scene.add(primary.dynamic);primary.buildTerrain();primary.buildSites();primary.controls={target:new T.Vector3(),update(){},mouseButtons:{}};primary.update(player);primary.setRivalState(rival,0,world.rival);const before=JSON.stringify([player,rival]);primary.frame();assert.equal(JSON.stringify([player,rival]),before);assert.equal(primary.rival.scene.position.x,0);assert.equal(primary.rival.E,world.rival);assert.equal(primary.sites.has('center'),true);assert.equal(primary.rival.sites.has('center'),false);let terrains=0,centers=0;primary.scene.traverse(o=>{if(o.name==='LivingLandscape')terrains++;if(o.userData.node==='center')centers++;});assert.equal(terrains,1);assert.equal(centers,1);assert.equal(primary.environment.plan.land.width,228);assert.equal(primary.environment.plan.sites.length,15);assert.equal(primary.environment.plan.peaks.length,world.player.mountainPeaks.length);assert(primary.trucks.get(1).group.position.x<0);assert(primary.rival.trucks.get(1).group.position.x>130);assert.equal(primary.rival.dynamic.getObjectByName('paid-roads'),undefined);assert(primary.dynamic.getObjectByName('paid-roads'));assert(playerGround({x:141,z:18},world.player));
});

test('Wheel zoom restores both sides statuses in the shared overview and hides them again on zoom out',()=>{
 const {host,shared}=setup(),world=RaceWorld.create(42),primary=new View(host,{},shared,world.player);primary.isCompanion=false;
 primary.controls={target:new T.Vector3(),update(){},mouseButtons:{}};
 const player=world.player.create(),rival=world.rival.create();rival.sites.iron.active=true;rival.sites.iron.stock=7;
 primary.update(player);primary.setRivalState(rival,0,world.rival);
 const before=JSON.stringify([player,rival]);
 for(const zoom of [1,1.79,1.8,4,1]){
  primary.camera.zoom=zoom;primary.frame();
  for(const view of [primary,primary.rival]){
   const label=view.sites.get('iron').label;
   assert.equal(label.textContent.includes('\n'),zoom>=1.8,`zoom ${zoom}, rival ${view.isCompanion}`);
   if(zoom>=1.8)assert(label.textContent.includes(view.E.siteStatus(view.state,'iron')));
  }
  if(zoom>=1.8)assert(primary.rival.sites.get('iron').label.textContent.includes('7'));
 }
 assert.equal(primary.overview,true);assert.equal(JSON.stringify([player,rival]),before);
});

test('Both authoritative routes and truck arrival animations meet the exact same center, while bot parking is mirrored',()=>{
 const world=RaceWorld.create(),poses=[];
 for(const engine of [world.player,world.rival]){const state=engine.create();state.paused=false;const info=engine.routeInfo(state,'center'),costs=info.points.slice(1).map((p,i)=>Math.hypot(p[0]-info.points[i][0],p[1]-info.points[i][1])*4),t={id:1,job:{target:'center'},leg:{points:info.points,costs,elapsed:costs.reduce((a,b)=>a+b,0)}};poses.push(truckPose(state,t,0,0,engine,MapScene.models));}
 assert(Math.abs(poses[0].x-poses[1].x)<1e-6);assert(Math.abs(poses[0].z-poses[1].z)<1e-6);assert(poses[0].x>50&&poses[0].x<65);const a=parkingSlot(1,world.player),b=parkingSlot(1,world.rival);assert(Math.abs(a.x+b.x-114)<1e-6);assert.equal(a.z,-b.z);assert(Math.abs(Math.cos(a.yaw)+Math.cos(b.yaw))<1e-6);const gate={x:141,z:18},approach=hubApproach(gate,1,true);assert.equal(approach.at(-1).x,gate.x);assert.equal(approach.at(-1).z,gate.z);
});
