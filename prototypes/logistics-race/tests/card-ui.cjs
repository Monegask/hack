const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const vm=require('node:vm');
const E=require('../dist/engine.js');
const {inspect}=require('../dist/card-ui.js');

function preview(s,id,type,target){
 const snapshot=structuredClone(s),serialized=JSON.stringify(s);
 const result=inspect(E,s,id,type,target);
 assert.deepEqual(s,snapshot,'Preview must preserve every state field, including reservations, fuel, trucks and statistics');
 assert.equal(JSON.stringify(s),serialized,'Preview must preserve serialized save state');
 return result;
}
function assertRoute(s,target,actual){
 const expected=E.routeInfo(s,target);
 assert.deepEqual(actual,expected,'Preview uses actual engine route, duration and capacity');
 const distance=expected.points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p[0]-expected.points[i][0],p[1]-expected.points[i][1]),0);
 assert(Math.abs(actual.fuel-distance*2*E.fuelRates.transport)<1e-10,'Fuel covers actual route distance in both directions');
}

test('Materials preview from a paused opening uses real cargo and paid route without spending or unpausing',()=>{
 const s=E.create();
 assert.equal(s.paused,true);
 const p=preview(s,1,'materials','iron');
 assert.equal(p.ok,true);assert.equal(p.reason,'');
 assert.deepEqual(p.cargo,{iron:4});
 assertRoute(s,'iron',p.route);
 assert.equal(p.route.capacity,4);
 assert.equal(s.paused,true);assert.equal(s.fuel,12);
 assert.deepEqual(s.sites.iron.incoming,{iron:0,copper:0});
 assert.deepEqual(s.stats,{spent:0,produced:0,trips:0});
});

test('A completed real road changes preview capacity and cost rather than using mock values',()=>{
 const s=E.create();s.roads=E.routeInfo(s,'iron').points.map(p=>p.join(','));
 const p=preview(s,1,'materials','iron');
 assert.equal(p.ok,true);assert.equal(p.route.capacity,8);
 assert.deepEqual(p.cargo,{iron:5,copper:1});
 assertRoute(s,'iron',p.route);
});

test('Busy trucks are excluded without disturbing an existing trip or incoming materials',()=>{
 const s=E.create();s.paused=false;
 assert(E.start(s,1,'materials','iron'));
 s.paused=true;
 const p=preview(s,1,'materials','copper');
 assert.equal(p.ok,false);assert.match(p.reason,/занята/i);assert.deepEqual(p.cargo,{});
 assert(s.trucks[0].job);assert(s.trucks[0].leg);
 assert.equal(s.sites.iron.incoming.iron,4);
});

test('Builders remain unavailable until received plus incoming covers every construction material',()=>{
 const s=E.create();
 const empty=preview(s,1,'crew','iron');
 assert.equal(empty.ok,false);assert.match(empty.reason,/отправьте все строительные материалы/i);
 s.paused=false;
 const spare=structuredClone(s.trucks[0]);spare.id=3;s.trucks.push(spare);
 assert(E.start(s,1,'materials','iron'));
 const partial=preview(s,3,'crew','iron');
 assert.equal(partial.ok,false);assert.match(partial.reason,/отправьте все строительные материалы/i);
 assert(E.start(s,2,'materials','iron'));
 assert.deepEqual(s.sites.iron.received,{iron:0,copper:0});
 assert.deepEqual(s.sites.iron.incoming,{iron:5,copper:1});
 s.paused=true;
 const incoming=preview(s,3,'crew','iron');
 assert.equal(incoming.ok,true);assert.deepEqual(incoming.cargo,{});
 assert.equal(s.builder,null,'Preview does not reserve builders');
 assertRoute(s,'iron',incoming.route);
});

test('Oil cannot be hauled by truck even when the second well is active',()=>{
 const s=E.create();s.sites.oil2.active=true;s.sites.oil2.stock=40;
 const p=preview(s,1,'haul','oil2');
 assert.equal(p.ok,false);assert.match(p.reason,/нефтепровод/i);assert.deepEqual(p.cargo,{});
 assert.equal(s.sites.oil2.claimed,0);
});

test('Order preview only loads needed cargo after accounting for deliveries already in transit',()=>{
 const s=E.create();s.city.asphalt=20;
 s.delivered={iron:11,copper:5,asphalt:7};s.outgoing.iron=1;
 const p=preview(s,1,'goal','center');
 assert.equal(p.ok,true);assert.deepEqual(p.cargo,{copper:1,asphalt:1});
 assertRoute(s,'center',p.route);
 assert.equal(s.outgoing.iron,1);assert.equal(s.outgoing.copper,0);assert.equal(s.outgoing.asphalt,0);
 s.outgoing.copper=1;s.outgoing.asphalt=1;
 const covered=preview(s,1,'goal','center');
 assert.equal(covered.ok,false);assert.match(covered.reason,/Нет нужных/i);
});

test('Won and underfunded states are rejected without changing the original state',()=>{
 const won=E.create();won.won=true;
 const p=preview(won,1,'materials','iron');
 assert.equal(p.ok,false);assert.match(p.reason,/завершена/i);
 const poor=E.create();poor.fuel=0;
 const q=preview(poor,1,'materials','iron');
 assert.equal(q.ok,false);assert.match(q.reason,/Недостаточно топлива/i);assert.deepEqual(q.cargo,{});
});

test('3D card template preserves app, manufacturing, road confirmation and bot extension hooks',()=>{
 const root=path.join(__dirname,'..');
 const template=fs.readFileSync(path.join(root,'game-3d/card-ui.html'),'utf8');
 const ids=['clock','pause','speed','reset','resources','map','mapView','roadTool','pipeTool','objective','siteGallery','details','fleetCount','fleet','buy','operations','operationsOpen','operationsClose','production','guide','journal','toast','intro','introClose','win','winText','winClose','restart','cancelReset','confirmReset','roadConfirm','roadConfirmText'];
 for(const id of ids)assert(template.includes('id="'+id+'"'),'Missing DOM hook '+id);
 assert(template.includes('<body class="three-game">'),'Race builder retains its body marker');
 assert.match(template,/<aside\b/);assert.match(template,/class="prototype-note"/);
 const scripts=[...template.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m=>m[1]);
 assert.deepEqual(scripts,['engine.js','map-scene.js','game-3d/scene.js','tutorial-coach.js','card-ui.js','app.js']);
 const build=fs.readFileSync(path.join(root,'game-3d/build.mjs'),'utf8');
 assert(build.includes("'card-ui.html'"),'3D page is generated from the persistent template');
 assert(build.includes("['card-ui.js',"),'Standalone build embeds card UI implementation');
 assert(build.includes("'card-ui.css'"),'Standalone build embeds card UI stylesheet');
});

function controller(s=E.create(),options={}){
 const elements=new Map();let ui,selected='iron',selectedTruck=1,performed=0;
 const body={};
 const $=id=>{if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',disabled:false,querySelector(){return null;},showModal(){this.open=true;},close(){this.open=false;},click(){this.onclick?.();}});return elements.get(id);};
 const context=vm.createContext({document:{body,activeElement:{closest(){return null;}}},matchMedia:()=>({matches:true})});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/card-ui.js'),'utf8'),context);
 ui=context.LogisticsCardUI.create({...options,E,$,fmt:String,state:()=>s,selected:()=>selected,truck:()=>selectedTruck,
  selectSite:id=>{selected=id;},selectTruck:id=>{selectedTruck=id;},refresh:()=>ui.render(),
  perform:fn=>{performed++;const ok=fn();ui.render();return ok;},confirmRoad:()=>{}});
 $('pause').onclick=()=>{s.paused=!s.paused;ui.render();};
 ui.render();
 const actionTag=key=>$('details').innerHTML.match(new RegExp('<button\\b[^>]*data-action="'+key+'"[^>]*>'))?.[0];
 return {ui,$,s,get performed(){return performed;},get selected(){return selected;},get selectedTruck(){return selectedTruck;},
  hasAction:key=>!!actionTag(key),clickAction(key){const tag=actionTag(key);if(!tag||/\bdisabled\b/.test(tag))return false;ui.handleAction(key);return true;}};
}

test('Controller begins a preview, rejects a busy truck and cancels a free choice without mutating the game',()=>{
 const s=E.create();s.paused=false;assert(E.start(s,1,'materials','iron'));s.paused=true;
 const h=controller(s),before=structuredClone(s);
 assert(h.clickAction('materials'));
 assert.equal(h.ui.getPending().truck,null);assert.deepEqual(s,before);
 h.ui.chooseTruck(1);
 assert.equal(h.ui.getPending().truck,null,'Busy truck never enters confirmation');
 assert.match(h.$('details').innerHTML,/занята/i);assert.deepEqual(s,before);
 h.ui.chooseTruck(2);
 assert.equal(h.ui.getPending().truck,2);assert(h.hasAction('resume'));
 assert.equal(h.hasAction('send'),false,'Paused UI offers resume, not dispatch');
 assert.equal(h.clickAction('send'),false);assert.equal(h.performed,0);
 assert.deepEqual(s,before);
 assert(h.clickAction('cancel'));assert.equal(h.ui.getPending(),null);
 assert.deepEqual(s,before,'Cancel spends neither cargo nor fuel and does not alter incoming');
});

test('Controller dispatches immediately on truck choice and dispatches a paused choice upon resume exactly once',()=>{
 const h=controller(),s=h.s;
 assert(h.clickAction('materials'));h.ui.chooseTruck(1);
 const paused=structuredClone(s);
 assert(h.hasAction('resume'));assert(!h.hasAction('send'));
 assert.deepEqual(s,paused);assert.equal(h.performed,0);
 const expected=structuredClone(s);expected.paused=false;assert(E.start(expected,1,'materials','iron'));
 assert(h.clickAction('resume'));assert.equal(h.performed,1);
 assert.deepEqual(s,expected,'Resuming dispatches the chosen truck with actual engine cargo, route and charges');
 assert.equal(h.ui.getPending(),null);assert(!h.hasAction('send'));
 const dispatched=structuredClone(s);h.ui.render();assert.deepEqual(s,dispatched,'Refresh cannot dispatch twice');
 h.ui.chooseSite('copper');assert(h.clickAction('materials'));h.ui.chooseTruck(2);
 assert.equal(h.ui.getPending(),null);assert.equal(h.performed,2);
 assert.equal(s.trucks[1].job.target,'copper');assert.equal(s.trucks[0].job.target,'iron');
});

test('Production toggle remains independent and a real haul can be finished through the truck controller',()=>{
 const s=E.create();s.paused=false;s.sites.gravel.active=true;
 assert(E.start(s,1,'haul','gravel'));
 const h=controller(s);h.ui.chooseSite('gravel');
 const before=structuredClone(s);assert(h.clickAction('toggle-site'));
 assert.equal(s.sites.gravel.enabled,false);
 const expected=structuredClone(before);expected.sites.gravel.enabled=false;
 assert.deepEqual(s,expected,'Production pause leaves fuel, route, cargo and truck work intact');
 h.ui.chooseTruck(1);assert(h.hasAction('stop'));assert(h.clickAction('stop'));
 assert.equal(s.trucks[0].stop,true);assert.equal(s.trucks[0].job.type,'haul');
 assert.deepEqual(s.trucks[0].job,before.trucks[0].job,'Finish requests return without deleting the active job');
 assert.deepEqual(s.trucks[0].leg,before.trucks[0].leg);assert.equal(s.fuel,before.fuel);
 assert.equal(h.clickAction('stop'),false,'Already finishing route is disabled');
 h.ui.chooseSite('asphalt');s.sites.asphalt.active=true;h.ui.render();
 const withStoppingTruck=structuredClone(s);assert(h.clickAction('toggle-asphalt'));
 assert.equal(s.enabled.asphalt,false);
 const asphaltExpected=structuredClone(withStoppingTruck);asphaltExpected.enabled.asphalt=false;
 assert.deepEqual(s,asphaltExpected,'Factory control does not retarget or cancel the truck');
});

test('Materials assignment accepts successive free trucks until the real remaining order is covered',()=>{
 const s=E.create();s.paused=false;const h=controller(s,{batchMaterials:true});assert(h.clickAction('materials'));h.ui.chooseTruck(1);assert.equal(h.ui.getPending().type,'materials');assert.equal(h.ui.getPending().sent,1);assert.equal(s.sites.iron.incoming.iron,4);assert.equal(h.performed,1);
 h.ui.chooseTruck(2);assert.equal(h.ui.getPending(),null);assert.equal(h.performed,2);assert.deepEqual(s.sites.iron.incoming,{iron:5,copper:1});assert.deepEqual(s.city,{iron:9,copper:5,gravel:0,asphalt:0,ironOre:0,copperOre:0,oil:0});
 const before=JSON.stringify(s);h.ui.chooseTruck(1);assert.equal(JSON.stringify(s),before,'Clicking a sent truck cannot repeat its shipment');
});
test('Cancelling after a partial multi-truck dispatch preserves and correctly describes the paid journey',()=>{
 const s=E.create();s.paused=false;const h=controller(s,{batchMaterials:true});h.clickAction('materials');h.ui.chooseTruck(1);const before=JSON.stringify(s);h.ui.handleAction('cancel');assert.equal(h.ui.getPending(),null);assert.equal(JSON.stringify(s),before);assert.match(h.$('details').innerHTML,/Уже отправленные машины продолжают рейсы/);
});
