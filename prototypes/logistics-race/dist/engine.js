(function(root){
'use strict';
function createForWorld(config={}){
const width=config.width||16,height=config.height||11,initialRoadCells=config.initialRoadCells||[];
const names={oil:'Нефть',iron:'Железо',copper:'Медь',gravel:'Щебень',asphalt:'Асфальт',ironOre:'Железная руда',copperOre:'Медная руда'};
const costs={oil2:{iron:5,copper:1},iron:{iron:5,copper:1},copper:{iron:5,copper:1},gravel:{iron:2,copper:1},asphalt:{iron:4,copper:2}};
const positions=config.positions||{oil2:[9,9],city:[3,8],oil:[1,8],iron:[1,7],copper:[7,8],gravel:[3,5],asphalt:[4,8],center:[11,4]};
const mountains=config.mountains||[[5,4],[6,4],[7,4],[5,5],[6,5],[7,5],[6,6],[7,6],[8,6]];
const fuelRates={transport:1.1/12,refinery:.11,metal:2/15*1.1,asphalt:.11};
const key=p=>p.join(',');
function create(){return {version:1,time:0,paused:true,won:false,fuel:12,city:{iron:14,copper:6,gravel:0,asphalt:0,ironOre:0,copperOre:0,oil:0},goal:{iron:12,copper:6,asphalt:8},delivered:{iron:0,copper:0,asphalt:0},outgoing:{iron:0,copper:0,asphalt:0},roads:[...initialRoadCells],pipeCells:[],oilPipe:null,sites:Object.fromEntries(Object.keys(costs).map(id=>[id,{id,active:false,enabled:true,stock:0,received:{iron:0,copper:0},incoming:{iron:0,copper:0},claimed:0,mining:null,construction:null}])),trucks:[truck(1),truck(2)],builder:null,production:{oil:null,refinery:null,metal:null,asphalt:null,vehicle:null},enabled:{oil:true,refinery:true,metal:true,asphalt:true},metalMode:'auto',log:[{t:0,text:'Начните с доставки материалов на железное месторождение.'}],notice:'',stats:{spent:0,produced:0,trips:0},firstDelivery:null};}
function truck(id){return {id,position:[...positions.city],job:null,leg:null,at:'city',status:'Свободен',cargo:{},stop:false,trip:0};}
function log(s,text){s.log.unshift({t:s.time,text});s.log=s.log.slice(0,40);}
function fail(s,text){s.notice=text;return false;}
function pay(s,n){if(s.fuel+1e-8<n)return false;s.fuel=Math.max(0,s.fuel-n);s.stats.spent+=n;return true;}
function traversable(p){return p[0]>=0&&p[0]<width&&p[1]>=0&&p[1]<height&&!mountains.some(q=>key(q)===key(p));}
function onRoad(s,p){return key(p)===key(positions.city)||s.roads.includes(key(p));}
const directions=config.directions||[[1,0],[0,-1],[-1,0],[0,1],[1,1],[1,-1],[-1,1],[-1,-1]];
function canStep(a,b){const dx=b[0]-a[0],dy=b[1]-a[1];return traversable(a)&&traversable(b)&&Math.max(Math.abs(dx),Math.abs(dy))===1&&(!dx||!dy||(traversable([a[0]+dx,a[1]])&&traversable([a[0],a[1]+dy])));}
function edgeLength(a,b){return Math.hypot(b[0]-a[0],b[1]-a[1]);}
function edgeTime(s,a,b){return edgeLength(a,b)*(onRoad(s,a)&&onRoad(s,b)?2:4);}
function upgrade(s){if(!s.sites.oil2)s.sites.oil2=create().sites.oil2;if(s.oilPipe===undefined)s.oilPipe=null;if(!s.pipeCells)s.pipeCells=(s.oilPipe?.points||[]).filter(p=>key(p)!==key(positions.city)).map(key);return s;}
function siteStatus(s,id){const site=s.sites[id];
 if(site&&!site.active)return site.construction?(Object.keys(costs[id]).every(k=>site.received[k]>=costs[id][k])?'СТРОИТЕЛЬСТВО':'ОЖИДАЕТ МАТЕРИАЛЫ'):'ТРЕБУЕТ СТРОИТЕЛЬСТВА';
 const cycle=id==='oil'?s.production.oil:id==='asphalt'?s.production.asphalt:site?.mining;
 const enabled=id==='oil'?s.enabled.oil:id==='asphalt'?s.enabled.asphalt:site?.enabled;
 if(!enabled)return cycle?'ЗАВЕРШАЕТ ЦИКЛ':'ПРИОСТАНОВЛЕНО';
 return cycle?'РАБОТАЕТ':'ОЖИДАЕТ';
}
const initialPipeCells=config.initialPipeCells||config.servicePipeCells||[positions.oil,[2,8],positions.city];
const pipeDirections=directions;
function canPipeStep(a,b){return canStep(a,b);}
function pipeEdges(s){const cells=[...new Map([...initialPipeCells,...(s.pipeCells||[]).map(k=>k.split(',').map(Number))].map(p=>[key(p),p])).values()],set=new Set(cells.map(key)),edges=[];
 for(const a of cells)for(const [dx,dy] of pipeDirections){const b=[a[0]+dx,a[1]+dy];if(set.has(key(b))&&key(a)<key(b)&&canPipeStep(a,b))edges.push([a,b]);}return edges;
}
function onPipe(s,p){return initialPipeCells.some(q=>key(q)===key(p))||(s.pipeCells||[]).includes(key(p));}
function pipeConnected(s){const seen=new Set(),open=[positions.city];while(open.length){const p=open.shift(),k=key(p);if(seen.has(k))continue;seen.add(k);if(k===key(positions.oil2))return true;for(const [dx,dy] of pipeDirections){const q=[p[0]+dx,p[1]+dy];if(canPipeStep(p,q)&&onPipe(s,q)&&!seen.has(key(q)))open.push(q);}}return false;}
function buildPipeCell(s,p){
 if(s.paused||s.won)return fail(s,'Сначала продолжите игру.');
 if(!traversable(p)||onPipe(s,p))return false;
 if(!pipeDirections.some(([dx,dy])=>{const q=[p[0]+dx,p[1]+dy];return canPipeStep(p,q)&&onPipe(s,q);})&&key(p)!==key(positions.oil2))return fail(s,'Начните от города, существующей трубы или второй скважины. Соединяйте соседние клетки, включая диагонали, без пересечения гор.');
 if(s.city.iron<1.5)return fail(s,'На клетку нефтепровода нужно 1,5 железа.');
 s.city.iron-=1.5;s.pipeCells.push(key(p));if(!s.oilPipe)s.oilPipe={left:5};
 if(pipeConnected(s))log(s,'Нефтепровод соединён с НПЗ: до 12 нефти / мин.');s.notice='';return true;
}
// Use the paved network whenever it connects both loading points. A faster
// cross-country shortcut must not silently abandon the road the player built.
// Within either network Dijkstra still chooses the quickest legal route.
function path(s,a,b,diagonal=true){
 return (onRoad(s,a)&&onRoad(s,b)?shortestPath(s,a,b,diagonal,true):null)||shortestPath(s,a,b,diagonal,false);
}
// Shared pure presentation geometry also constrains authoritative route planning.
// Keep model anchors and yard dimensions aligned with the 3D asset layout.
const travelAnchors=config.travelAnchors||{oil:[75,468],oil2:[585,535],iron:[100,340],copper:[470,445],gravel:[245,265],asphalt:[345,445]};
const travelSizes=config.travelSizes||{oil:[6.25,6],oil2:[6.25,6],iron:[6.8,6.5],copper:[6.8,6.5],gravel:[8.9,7.3],asphalt:[8.3,6.8],city:[12.8*1.15,11.8*1.15],center:[12.8*1.15,11.8*1.15]};
const travelWorld=p=>({x:(p[0]-7.5)*6,z:(p[1]-5)*6});
const hubMirrors=config.hubMirrors||{};
const worldBounds=config.worldBounds||{minX:-58,maxX:58,minZ:-42,maxZ:42,centerX:0,centerZ:0,width:116,depth:84};
const travelNodes=config.travelNodes||Object.entries(positions).map(([id,p])=>{const gate=travelWorld(p),at=travelAnchors[id],hub=id==='city'||id==='center',point=hub?{x:gate.x+(hubMirrors[id]?1:-1)*2.83*1.15,z:gate.z+(hubMirrors[id]==="rotate"?-7.9:7.9)}:at?travelWorld([(at[0]-54)/56,(at[1]-44)/54]):gate;return {id,position:p,point,size:travelSizes[id],hub,mirror:hubMirrors[id]||false,...(hub?{gate}:{})};});
let travelProjection;
function travelPoint(p){
 if(!travelProjection){
  const points=Array.from({length:width*height},()=>({x:0,z:0,fixed:false}));
  for(const q of mountains)points[q[1]*width+q[0]].fixed=true;
  for(const node of travelNodes){const q=node.position,w=travelWorld(q),v=node.gate||node.point;Object.assign(points[q[1]*width+q[0]],{x:v.x-w.x,z:v.z-w.z,fixed:true});}
  // Fixed free-ground nodes keep the asphalt service corridor clear of the ridge.
  const pins=config.projectionPins||[5,6].map(x=>({position:[x,7],point:{x:travelWorld([x,7]).x,z:9.4}}));
  for(const pin of pins){const q=pin.position,w=travelWorld(q);Object.assign(points[q[1]*width+q[0]],{x:pin.point.x-w.x,z:pin.point.z-w.z,fixed:true});}
  for(let pass=0;pass<240;pass++)for(let z=0;z<height;z++)for(let x=0;x<width;x++){const at=points[z*width+x];if(at.fixed)continue;const near=[[x-1,z],[x+1,z],[x,z-1],[x,z+1]].filter(([x,z])=>x>=0&&x<width&&z>=0&&z<height).map(([x,z])=>points[z*width+x]);at.x=x===0||x===width-1?0:near.reduce((s,p)=>s+p.x,0)/near.length;at.z=z===0||z===height-1?0:near.reduce((s,p)=>s+p.z,0)/near.length;}
  travelProjection=points;
 }
 const w=travelWorld(p),at=travelProjection[p[1]*width+p[0]];return at?{x:w.x+at.x,z:w.z+at.z}:w;
}
const travelFootprints=travelNodes.flatMap(node=>{const [w,d]=node.clearanceSize||node.size;return [node.clearancePoint||node.point,...(node.clearanceCopies||[])].map((at,i)=>({id:node.id+(i?':clearance'+i:''),position:node.position,hub:node.hub,min:{x:at.x-w/2,z:at.z-d/2},max:{x:at.x+w/2,z:at.z+d/2}}));});
function crossesTravelFootprint(a,b,rect,margin=.70){
 let lo=0,hi=1;for(const axis of ['x','z']){const d=b[axis]-a[axis],min=rect.min[axis]-margin,max=rect.max[axis]+margin;if(Math.abs(d)<1e-10){if(a[axis]<min||a[axis]>max)return false;continue;}let u=(min-a[axis])/d,v=(max-a[axis])/d;if(u>v)[u,v]=[v,u];lo=Math.max(lo,u);hi=Math.min(hi,v);if(lo>hi)return false;}return true;
}
// Enterprise yards are destinations, never shortcuts for unrelated missions.
// The same rule applies to unbuilt plots and to the two sides of a diagonal.
const enterpriseCells=new Set(travelNodes.map(node=>key(node.position))),travelSteps=new Map();
function canTravelStep(a,b,start,end){
 const cacheKey=key(start)+'|'+key(end)+'|'+key(a)+'>'+key(b);
 if(!travelSteps.has(cacheKey))travelSteps.set(cacheKey,travelStepAllowed(a,b,start,end));
 return travelSteps.get(cacheKey);
}
function travelStepAllowed(a,b,start,end){
 const blocked=p=>{const k=key(p);return enterpriseCells.has(k)&&k!==key(start)&&k!==key(end);};
 if(!canStep(a,b)||blocked(b))return false;
 const dx=b[0]-a[0],dy=b[1]-a[1];
 if(dx&&dy&&(blocked([a[0]+dx,a[1]])||blocked([a[0],a[1]+dy])))return false;
 const aa=travelPoint(a),bb=travelPoint(b);
 return !travelFootprints.some(rect=>(rect.hub||(key(rect.position)!==key(start)&&key(rect.position)!==key(end)))&&crossesTravelFootprint(aa,bb,rect));
}
function shortestPath(s,a,b,diagonal,roadOnly){
 const start=key(a),end=key(b),dist={[start]:0},prev={},open=[a],visited=new Set();
 while(open.length){open.sort((x,y)=>dist[key(x)]-dist[key(y)]);const p=open.shift(),pk=key(p);if(visited.has(pk))continue;visited.add(pk);if(pk===end)break;
  for(const [dx,dy] of directions){const q=[p[0]+dx,p[1]+dy],qk=key(q);if(!canTravelStep(p,q,a,b)||(dx&&dy&&!diagonal)||(roadOnly&&!onRoad(s,q)))continue;const d=dist[pk]+edgeTime(s,p,q);if(dist[qk]===undefined||d<dist[qk]){dist[qk]=d;prev[qk]=p;open.push(q);}}
 }
 if(dist[end]===undefined)return null;const points=[b];while(key(points[0])!==start)points.unshift(prev[key(points[0])]);return points;
}
function routeInfo(s,id){const points=path(s,positions.city,positions[id]);return {points,capacity:points.every(p=>onRoad(s,p))?8:4,fuel:points.slice(1).reduce((n,p,i)=>n+edgeLength(points[i],p),0)*2*fuelRates.transport,seconds:duration(s,points)};}
function duration(s,points){let t=0;for(let i=1;i<points.length;i++)t+=edgeTime(s,points[i-1],points[i]);return t;}
function setLeg(s,t,points,kind){t.leg={points:points.map(p=>[...p]),costs:points.slice(1).map((p,i)=>edgeTime(s,points[i],p)),elapsed:0,kind};t.at=null;t.status=kind==='out'?'В пути к объекту':'Возвращается';}
function chooseTruck(s,id){return s.trucks.find(t=>t.id===id&&!t.job&&!t.leg);}
function start(s,truckId,type,target){
 if(s.won)return fail(s,'Поставка уже завершена. Начните новую партию.');
 if(s.paused)return fail(s,'Нажмите «Начать» или «Продолжить», чтобы отправить машину.');
 const t=chooseTruck(s,truckId);if(!t)return fail(s,'Эта машина занята. Выберите свободную.');
 if(!positions[target]||!['materials','crew','haul','goal'].includes(type))return false;
 const site=s.sites[target],r=routeInfo(s,target);let cargo={},reservation=0;
 if(type==='materials'){
  if(!site||site.active||site.construction)return fail(s,'Этот объект уже построен или строится.');let room=r.capacity;
  for(const k of ['iron','copper']){const n=Math.min(room,s.city[k],Math.max(0,costs[target][k]-site.received[k]-site.incoming[k]));if(n){cargo[k]=n;room-=n;}}
  if(!Object.keys(cargo).length)return fail(s,'Материалы уже доставлены, находятся в пути или отсутствуют на складе.');
 }
 if(type==='crew'){
  if(!site||site.active||site.construction||s.builder!==null)return fail(s,'Строители заняты или объект уже готов.');
  if(!Object.keys(costs[target]).every(k=>site.received[k]+site.incoming[k]>=costs[target][k]))return fail(s,'Сначала отправьте все строительные материалы.');
 }
 if(type==='haul'){
  if(target==='oil2')return fail(s,'Для нефти постройте нефтепровод в карточке скважины.');
  if(!site||!site.active||target==='asphalt')return fail(s,'Сначала постройте добывающий объект.');
  reservation=r.capacity;
 }
 if(type==='goal'){
  if(target!=='center')return fail(s,'Победная поставка отправляется в хаб.');
  let room=r.capacity;
  for(const k of Object.keys(s.goal)){const n=Math.min(room,s.city[k],s.goal[k]-s.delivered[k]-s.outgoing[k]);if(n>0){cargo[k]=n;room-=n;}}
  if(!Object.keys(cargo).length)return fail(s,'Нет нужных для заказа грузов. Проверьте склад и поставки в пути.');
 }
 if(!pay(s,r.fuel))return fail(s,'Недостаточно топлива на весь рейс туда и обратно.');
 for(const k in cargo)s.city[k]-=cargo[k];
 if(type==='materials')for(const k in cargo)site.incoming[k]+=cargo[k];
 if(type==='goal')for(const k in cargo)s.outgoing[k]+=cargo[k];
 if(type==='crew')s.builder=t.id;
 if(type==='haul')site.claimed+=reservation;
 t.job={type,target,route:r.points,capacity:r.capacity,reserved:reservation};t.cargo=cargo;t.stop=false;t.trip++;s.stats.trips++;setLeg(s,t,r.points,'out');s.notice='';return true;
}
function goHome(s,t){setLeg(s,t,[...t.job.route].reverse(),'back');}
function release(s,t){if(s.builder===t.id)s.builder=null;t.job=null;t.leg=null;t.cargo={};t.at='city';t.position=[...positions.city];t.status='Свободен';t.stop=false;}
function arrival(s,t,kind){
 const j=t.job,site=s.sites[j.target];
 if(kind==='back'){
  for(const k in t.cargo)s.city[k]+=t.cargo[k];
  const repeat=j.type==='haul'&&!t.stop,target=j.target;release(s,t);
  if(repeat){if(!start(s,t.id,'haul',target))log(s,'Машина '+t.id+': маршрут остановлен — не хватает топлива.');}
  return;
 }
 t.at=j.target;
 if(j.type==='materials'){for(const k in t.cargo){site.received[k]+=t.cargo[k];site.incoming[k]-=t.cargo[k];}log(s,'Материалы доставлены: '+label(j.target));t.cargo={};goHome(s,t);}
 if(j.type==='crew'){site.construction={left:2,truck:t.id};t.status='Ожидает материалы';}
 if(j.type==='haul'){t.status='Ожидает груз';pickup(s,t);}
 if(j.type==='goal'){
  for(const k in t.cargo){s.delivered[k]+=t.cargo[k];s.outgoing[k]-=t.cargo[k];}
  if(s.firstDelivery===null)s.firstDelivery=s.time;log(s,'В хаб: '+cargoText(t.cargo));t.cargo={};goHome(s,t);
  if(Object.keys(s.goal).every(k=>s.delivered[k]>=s.goal[k])){s.won=true;s.paused=true;log(s,'Хаб снабжён. Победа!');}
 }
}
function pickup(s,t){const j=t.job,site=s.sites[j.target];if(!site)return;
 if(site.stock>=j.capacity||t.stop){const n=Math.min(site.stock,j.capacity);site.stock-=n;site.claimed-=j.reserved;j.reserved=0;t.cargo=n?{[j.target==='gravel'?'gravel':j.target+'Ore']:n}:{};goHome(s,t);}
}
function stopTruck(s,id){const t=s.trucks.find(t=>t.id===id);if(!t||!t.job||t.job.type!=='haul')return false;t.stop=true;if(!t.leg&&t.at===t.job.target)pickup(s,t);return true;}
function buyTruck(s){if(s.paused||s.won)return fail(s,'Сначала продолжите игру.');if(s.production.vehicle)return fail(s,'Машина уже собирается.');if(s.city.iron<3||s.city.copper<1||s.fuel<.4)return fail(s,'Нужно 3 железа, 1 медь и 0,4 топлива.');pay(s,.4);s.city.iron-=3;s.city.copper--;s.production.vehicle={left:12};log(s,'Сборка машины началась.');return true;}
function buildRoad(s,p){if(s.paused||s.won)return false;if(!traversable(p)||onRoad(s,p))return false;
 if(!directions.some(([x,y])=>{const q=[p[0]+x,p[1]+y];return canStep(p,q)&&onRoad(s,q);}))return fail(s,'Продолжайте дорогу от города или готовой соседней клетки.');
 if(s.city.asphalt<2)return fail(s,'Недостаточно асфальта. На одну клетку нужно 2 асфальта.');s.city.asphalt-=2;s.roads.push(key(p));s.notice='';return true;}
function roadToCenter(s){const points=path(s,positions.city,positions.center);const cells=points.filter(p=>!onRoad(s,p));const price=cells.length*2;
 if(s.paused||s.won)return fail(s,'Сначала продолжите игру.');if(s.city.asphalt<price)return fail(s,'Для этого маршрута нужно '+price+' асфальта.');for(const p of cells)buildRoad(s,p);return true;}
function label(id){return {oil2:'Вторая скважина',iron:'Железный рудник',copper:'Медный рудник',gravel:'Карьер',asphalt:'Асфальтовый завод',city:'Город',center:'Хаб',oil:'Стартовая скважина'}[id]||id;}
function cargoText(c){return Object.entries(c).map(([k,n])=>n+' '+names[k].toLowerCase()).join(', ');}
function tick(s,dt){
 if(s.paused||s.won)return;s.time+=dt;
 for(const t of s.trucks){if(!t.leg)continue;const leg=t.leg;leg.elapsed+=dt;let elapsed=leg.elapsed,index=0;while(index<leg.costs.length&&elapsed>=leg.costs[index]){elapsed-=leg.costs[index++];}
    if(index>=leg.costs.length){t.position=[...leg.points.at(-1)];t.leg=null;arrival(s,t,leg.kind);if(s.won)return;}
  else{const a=leg.points[index],b=leg.points[index+1],u=elapsed/leg.costs[index];t.position=[a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u];}
 }
 for(const site of Object.values(s.sites)){
  if(site.construction&&Object.keys(costs[site.id]).every(k=>site.received[k]>=costs[site.id][k])){s.trucks.find(t=>t.id===site.construction.truck).status='Строительство · 2 с';site.construction.left-=dt;if(site.construction.left<=0){const t=s.trucks.find(t=>t.id===site.construction.truck);site.construction=null;site.active=true;site.received={iron:0,copper:0};log(s,label(site.id)+' запущен.');goHome(s,t);}}
  if(site.mining){site.mining.left-=dt;if(site.mining.left<=0){site.stock++;site.mining=null;}}
  if(site.active&&site.id!=='asphalt'&&site.enabled&&!site.mining&&pay(s,site.id==='gravel'?1/12:1.5/12))site.mining={left:5};
 }
 if(s.oilPipe&&pipeConnected(s)&&s.sites.oil2.stock>0){s.oilPipe.left-=dt;if(s.oilPipe.left<=0){s.sites.oil2.stock--;s.city.oil++;s.oilPipe.left=5;}}
 for(const t of s.trucks)if(t.job?.type==='haul'&&!t.leg&&t.at===t.job.target)pickup(s,t);
 const pr=s.production;
 for(const id of ['oil','refinery','metal','asphalt','vehicle'])if(pr[id]){
  pr[id].left-=dt;if(pr[id].left<=0){const p=pr[id];pr[id]=null;
   if(id==='oil')s.city.oil++;
   if(id==='refinery'){s.fuel+=2;s.stats.produced+=2;}
   if(id==='metal')s.city[p.kind]+=2;
   if(id==='asphalt')s.city.asphalt+=2;
   if(id==='vehicle'){s.trucks.push(truck(s.trucks.length+1));log(s,'Новая машина готова.');}
  }
 }
 if(s.enabled.oil&&!pr.oil&&pay(s,1/6))pr.oil={left:10};
 if(s.enabled.refinery&&!pr.refinery&&s.city.oil>=2&&pay(s,fuelRates.refinery)){s.city.oil-=2;pr.refinery={left:4};}
 const metal=(s.metalMode==='auto'?['iron','copper']:[s.metalMode]).find(k=>s.city[k+'Ore']>=2);
 if(s.enabled.metal&&!pr.metal&&metal&&pay(s,fuelRates.metal)){s.city[metal+'Ore']-=2;pr.metal={left:4,kind:metal};}
 if(s.sites.asphalt.active&&s.enabled.asphalt&&!pr.asphalt&&s.city.gravel>=2&&pay(s,fuelRates.asphalt)){s.city.gravel-=2;pr.asphalt={left:4};}
}
const api={createForWorld,width,height,initialRoadCells,worldBounds,hubMirrors,mountainPeaks:config.mountainPeaks,initialPipeCells,travelNodes,travelAnchors,travelSizes,travelPoint,travelFootprints,crossesTravelFootprint,canTravelStep,canPipeStep,pipeEdges,onRoad,fuelRates,upgrade,siteStatus,buildPipeCell,pipeConnected,onPipe,pipeDirections,canStep,directions,create,tick,start,buyTruck,stopTruck,buildRoad,roadToCenter,routeInfo,path,label,names,costs,positions,mountains,cargoText};
return api;
}
const api=createForWorld();
if(typeof module!=='undefined')module.exports=api;root.Logistics=api;
})(typeof globalThis!=='undefined'?globalThis:this);
