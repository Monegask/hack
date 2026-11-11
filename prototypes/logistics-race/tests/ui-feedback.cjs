const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const E=require('../dist/engine.js');
function harness(s=E.create(),storage=new Map(),options={}){
 const nodes=new Map();let selected='iron',truck=1,ui,performed=0;
 const $=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',disabled:false,hidden:false,querySelector(){return null;},showModal(){},close(){},click(){this.onclick?.();}});return nodes.get(id);};
 const context=vm.createContext({document:{body:{dataset:{}},activeElement:{closest(){return null;}}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},matchMedia:()=>({matches:true})});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/card-ui.js'),'utf8'),context);
 ui=context.LogisticsCardUI.create({...options,E,$,fmt:String,state:()=>s,selected:()=>selected,truck:()=>truck,selectSite:id=>selected=id,selectTruck:id=>truck=id,refresh:()=>ui.render(),perform:fn=>{performed++;const ok=fn();ui.render();return ok;}});
 $('pause').onclick=()=>{s.paused=!s.paused;ui.render();};ui.render();
 return {s,ui,$,storage,get selected(){return selected;},get truck(){return truck;},get performed(){return performed;},has:key=>new RegExp('data-action="'+key+'"').test($('details').innerHTML),act:key=>ui.handleAction(key),runUntil:predicate=>{for(let n=0;n<10000&&!predicate();n++){E.tick(s,.1);ui.render();}assert(predicate(),'Simulation must reach requested milestone');}};
}
test('Construction UI unlocks builders once every material is received or already in transit',()=>{
 const h=harness(),s=h.s;s.paused=false;h.ui.render();
 assert(h.has('materials'));assert(!h.has('crew'));
 h.act('materials');h.ui.chooseTruck(1);h.act('materials');h.ui.chooseTruck(2);
 assert(h.has('crew'),'All dispatched cargo unlocks builders before arrival');assert(!h.has('materials'),'Fully covered delivery no longer offers a redundant shipment');
 h.runUntil(()=>Object.entries(E.costs.iron).every(([k,n])=>s.sites.iron.received[k]>=n));
 assert(!h.has('materials'));assert(h.has('crew'));
 h.runUntil(()=>s.trucks.some(t=>!t.job));
 h.act('crew');h.ui.chooseTruck(s.trucks.find(t=>!t.job).id);
 assert.equal(s.builder!==null,true);assert(!h.ui.getPending());
 h.runUntil(()=>s.sites.iron.active);assert(h.has('haul'));assert(!h.has('crew'));assert(!h.has('materials'));
});
test('Transport exposes status and recall only; center has no automatic road action',()=>{
 const h=harness();const before=structuredClone(h.s);h.ui.chooseTruck(1);
 assert(!h.has('choose-work'));assert(!h.has('materials'));assert.match(h.$('details').innerHTML,/Assign a new job through a site card/);
 h.ui.chooseSite('center');assert(h.has('goal'));assert(!h.has('road-center'));assert.deepEqual(h.s,before);
});
test('Goal shipment values occupy a separate row and completed mines use a pickaxe',()=>{
 const h=harness();h.s.outgoing.iron=3.5;h.ui.render();assert.match(h.$('objective').innerHTML,/<small class="goal-transit">In transit: 3.5<\/small>/);
 const unbuilt=h.$('siteGallery').innerHTML;h.s.sites.iron.active=true;h.ui.render();assert.notEqual(unbuilt,h.$('siteGallery').innerHTML);assert.match(h.$('siteGallery').innerHTML,/m14 13-8.381 8.38/);
});
test('Interactive lesson follows a real delivery, construction and first ore return, then releases strategy',()=>{
 const h=harness(),s=h.s;assert.match(h.$('tutorial').innerHTML,/Start with one delivery/);
 h.$('pause').click();assert.match(h.$('tutorial').innerHTML,/Deliver materials/);
 h.act('materials');assert.match(h.$('tutorial').innerHTML,/Choose a truck/);h.ui.chooseTruck(1);
 h.act('materials');h.ui.chooseTruck(2);h.runUntil(()=>s.trucks.every(t=>!t.job));
 assert.match(h.$('tutorial').innerHTML,/Now send builders/);
 h.act('crew');h.ui.chooseTruck(1);assert.match(h.$('tutorial').innerHTML,/Builders heading to site/);h.runUntil(()=>!!s.sites.iron.construction);assert.match(h.$('tutorial').innerHTML,/Construction in progress/);h.runUntil(()=>s.sites.iron.active);
 assert.match(h.$('tutorial').innerHTML,/Assign hauling/);
 h.act('haul');h.ui.chooseTruck(2);h.runUntil(()=>/First cycle complete/.test(h.$('tutorial').innerHTML));
 assert(s.city.ironOre>0||s.production.metal||s.city.iron>0);assert.match(h.$('tutorial').innerHTML,/Choose your strategy/);
 const save=JSON.stringify(s);h.ui.dismissTutorial();assert(h.$('tutorial').hidden);assert.equal(JSON.stringify(s),save,'Dismissal cannot alter game/save state');
 h.ui.startTutorial();assert(!h.$('tutorial').hidden);assert.equal(JSON.stringify(s),save,'Reopening cannot alter the game');
});
test('Tutorial reload remembers a watched ore return and asphalt introduces roads after the basic lesson is dismissed',()=>{
 const h=harness(),s=h.s;s.paused=false;s.sites.iron.active=true;s.sites.iron.stock=8;h.ui.render();
 h.act('haul');h.ui.chooseTruck(1);h.runUntil(()=>s.trucks[0].leg?.kind==='back');
 const restored=harness(structuredClone(s),h.storage);restored.runUntil(()=>/First cycle complete/.test(restored.$('tutorial').innerHTML));
 restored.ui.dismissTutorial();restored.s.sites.asphalt.active=true;restored.s.city.asphalt=2;restored.ui.render();
 assert(!restored.$('tutorial').hidden);assert.match(restored.$('tutorial').innerHTML,/Road construction unlocked/);
 const before=JSON.stringify(restored.s);restored.ui.dismissTutorial();assert(restored.$('tutorial').hidden);assert.equal(JSON.stringify(restored.s),before);
});


test('Road hint respects an unfinished quarry instead of requesting unavailable haul',()=>{
 const h=harness();h.s.paused=false;h.ui.dismissTutorial();h.s.sites.asphalt.active=true;h.ui.render();
 assert.match(h.$('tutorial').innerHTML,/Build the quarry first/);
 h.ui.chooseSite('gravel');h.act('materials');assert.match(h.$('tutorial').innerHTML,/Choose a truck/);
});


test('Early builders can dispatch while materials travel and wait at the site until the last shipment arrives',()=>{
 const h=harness(),s=h.s;s.paused=false;
 const third=structuredClone(s.trucks[0]);third.id=3;s.trucks.push(third);h.ui.render();
 h.act('materials');h.ui.chooseTruck(1);assert(!h.has('crew'),'A partial delivery is not enough');
 h.act('materials');h.ui.chooseTruck(2);assert(h.has('crew'));
 assert.deepEqual(s.sites.iron.received,{iron:0,copper:0});
 s.trucks[0].leg.elapsed=-100;
 h.act('crew');h.ui.chooseTruck(3);
 assert.equal(s.builder,3);assert(!h.has('crew'));assert.match(h.$('details').innerHTML,/Builders are on the way/);
 h.runUntil(()=>!!s.sites.iron.construction);assert(!s.sites.iron.active);assert.match(h.$('tutorial').innerHTML,/Builders awaiting materials/);
 h.runUntil(()=>s.sites.iron.active);assert.equal(s.sites.iron.active,true);
});
test('An assigned haul is replaced by fleet management and reappears after its recall is requested',()=>{
 const h=harness(),s=h.s;s.paused=false;s.sites.iron.active=true;h.ui.render();assert(h.has('haul'));
 h.act('haul');h.ui.chooseTruck(1);assert(!h.has('haul'));assert(h.has('haul-transport'));assert.doesNotMatch(h.$('details').innerHTML,/Hauling assigned|Truck 1 sent/);
 const before=structuredClone(s);h.act('haul');assert.equal(h.ui.getPending(),null);assert.deepEqual(s,before,'Hidden duplicate hauling cannot be dispatched by calling the controller');
 h.act('haul-transport');assert.equal(h.truck,1);assert(h.has('stop'));h.act('stop');h.ui.chooseSite('iron');assert(h.has('haul'),'A finishing haul does not reserve the site for another cycle');
});
test('Enterprise header and animated destination precede a full-width action area',()=>{
 const h=harness(),html=h.$('details').innerHTML;
 assert(html.indexOf('class="selected-header"')<html.indexOf('class="action-list"'));
 assert(html.indexOf('class="selected-disc"')<html.indexOf('class="action-list"'));
 const css=fs.readFileSync(path.join(__dirname,'../dist/card-ui.css'),'utf8');
 assert.match(css,/grid-template-columns:minmax\(0,1fr\) 420px/);
 assert.match(css,/#fleet\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\);[^}]*max-height:none;overflow:visible/);
 assert.match(css,/\.selection\{min-height:220px;overflow:visible/);
});
test('Drawing mode blocks gallery and transport selection without cancelling the pending assignment',()=>{
 let drawing=false;const h=harness(E.create(),new Map(),{canSelectSite:()=>!drawing});
 h.s.paused=false;h.act('materials');const before=structuredClone(h.s);drawing=true;
 h.ui.chooseSite('copper');h.ui.chooseTruck(1);
 assert.equal(h.selected,'iron');assert.equal(h.ui.getPending().target,'iron');assert.equal(h.ui.getPending().truck,null);assert.deepEqual(h.s,before);
 assert.match(h.$('details').innerHTML,/Finish drawing/);
 drawing=false;h.ui.chooseTruck(1);assert.equal(h.s.trucks[0].job.target,'iron');
});


test('Center explains incomplete connection and acknowledges a fully connected entrance',()=>{
 const h=harness();h.ui.chooseSite('center');assert.match(h.$('details').innerHTML,/Entrance not connected · capacity 4/);
 h.s.roads=E.path(h.s,E.positions.city,E.positions.center).slice(1).map(p=>p.join(','));h.ui.render();
 assert.match(h.$('details').innerHTML,/Entrance connected · capacity 8/);
});


test('Every unfinished enterprise keeps a construction helmet in its gallery and header until it becomes active',()=>{
 const h=harness();
 const galleryButton=id=>h.$('siteGallery').innerHTML.match(new RegExp('<button[^>]*data-site="'+id+'"[^>]*>[\\s\\S]*?<\\/button>'))?.[0]||'';
 const builtIcons={iron:'pickaxe',copper:'pickaxe',gravel:'gravel',asphalt:'asphalt',oil2:'oil2'};
 for(const [id,builtIcon] of Object.entries(builtIcons)){
  h.ui.chooseSite(id);assert.match(galleryButton(id),/data-icon="hardhat"/);assert.match(h.$('details').innerHTML,/class="selected-disc"><svg data-icon="hardhat"/);
  const before=JSON.stringify(h.s);h.ui.render();assert.equal(JSON.stringify(h.s),before,'Icon rendering must preserve all state fields');
  h.s.sites[id].construction={left:1,truck:1};h.ui.render();assert.match(galleryButton(id),/data-icon="hardhat"/,'Construction in progress still uses a helmet');
  h.s.sites[id].active=true;h.s.sites[id].construction=null;h.ui.render();
  assert.match(galleryButton(id),new RegExp('data-icon="'+builtIcon+'"'));assert.doesNotMatch(galleryButton(id),/data-icon="hardhat"/);
  assert.match(h.$('details').innerHTML,new RegExp('class="selected-disc"><svg data-icon="'+builtIcon+'"'));
 }
 h.ui.chooseSite('center');assert.match(galleryButton('center'),/data-icon="center"/);assert.doesNotMatch(h.$('details').innerHTML,/data-icon="hardhat"/);
 h.ui.chooseTruck(1);assert.match(h.$('details').innerHTML,/class="selected-disc"><svg data-icon="truck"/);
});
test('Built asphalt plant has a monochrome storage-and-mixer SVG distinct from generic factory and route symbols',()=>{
 const {icon}=require('../dist/card-ui.js');const svg=icon('asphalt');
 assert.match(svg,/data-icon="asphalt"/);assert.match(svg,/viewBox="0 0 24 24"/);
 assert.match(svg,/fill="none" stroke="currentColor" stroke-width="1.6"/);
 assert.match(svg,/<g data-part="silos">/);assert.match(svg,/<g data-part="mixer">/);assert.match(svg,/data-part="plant-base"/);
 assert.doesNotMatch(svg,/<(?:image|foreignObject|script)\b|(?:href|https?):|#[0-9a-f]{3,8}/i);
 assert.notEqual(svg,icon('route'));assert.notEqual(svg,icon('hardhat'));
 const h=harness();h.ui.chooseSite('asphalt');assert.doesNotMatch(h.$('details').innerHTML,/data-part="mixer"/);
 h.s.sites.asphalt.active=true;h.ui.render();assert.match(h.$('details').innerHTML,/data-part="mixer"/);
});
