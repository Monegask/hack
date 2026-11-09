const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Base=require('../dist/engine.js'),World=require('../dist/race-world.js'),UI=require('../dist/card-ui.js');
function harness(E,s=E.create()){
 const nodes=new Map();let selected='iron',truck=1,ui;
 const $=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',disabled:false,hidden:false,querySelector(){return null;},showModal(){},close(){},click(){this.onclick?.();}});return nodes.get(id);};
 const context=vm.createContext({document:{body:{dataset:{practice:'true'}},activeElement:{closest(){return null;}}},matchMedia:()=>({matches:true})});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/card-ui.js'),'utf8'),context);
 ui=context.LogisticsCardUI.create({E,$,fmt:String,state:()=>s,selected:()=>selected,truck:()=>truck,selectSite:id=>selected=id,selectTruck:id=>truck=id,refresh:()=>ui.render(),perform:fn=>{const ok=fn();ui.render();return ok;}});
 $('pause').onclick=()=>{s.paused=!s.paused;ui.render();};ui.render();return {s,ui,$};
}
test('Shared-world contexts keep one center but UI preview and shipments are bound to their own city and order',()=>{
 const {player,rival}=World.create(),a=player.create(),b=rival.create(),soloBefore=JSON.stringify(Base.create());
 assert.deepEqual(player.positions.center,rival.positions.center);assert.notDeepEqual(player.positions.city,rival.positions.city);
 a.paused=false;b.paused=false;
 const aBefore=JSON.stringify(a),bBefore=JSON.stringify(b);
 const previewA=UI.inspect(player,a,1,'goal','center'),previewB=UI.inspect(rival,b,1,'goal','center');
 assert(previewA.ok&&previewB.ok);assert.deepEqual(previewA.route.points[0],player.positions.city);assert.deepEqual(previewB.route.points[0],rival.positions.city);
 assert.deepEqual(previewA.route.points.at(-1),previewB.route.points.at(-1));assert.equal(JSON.stringify(a),aBefore);assert.equal(JSON.stringify(b),bBefore);
 for(const key of Object.keys(a.enabled))a.enabled[key]=false;
 assert(player.start(a,1,'goal','center'));assert.equal(a.outgoing.iron,4);assert.equal(b.outgoing.iron,0);
 for(let i=0;i<2000&&!a.delivered.iron;i++)player.tick(a,.1);
 assert.equal(a.delivered.iron,4);assert.equal(b.delivered.iron,0);assert.equal(b.won,false);assert.equal(JSON.stringify(b),bBefore,'A delivery at the shared center cannot mutate the other order');
 assert.equal(Base.width,16);assert.deepEqual(Base.positions.center,[11,4]);assert.equal(JSON.stringify(Base.create()),soloBefore,'Shared-world creation and progress cannot change default solo state');
});
test('Both shared-world controllers retain helmet-to-production icons and independently render their order totals',()=>{
 const {player,rival}=World.create();const first=harness(player),second=harness(rival);
 for(const h of [first,second]){
  assert.match(h.$('siteGallery').innerHTML,/data-icon="hardhat"/);
  h.ui.chooseSite('asphalt');assert.match(h.$('details').innerHTML,/class="selected-disc"><svg data-icon="hardhat"/);
  h.s.sites.asphalt.active=true;h.ui.render();assert.match(h.$('details').innerHTML,/data-part="mixer"/);
 }
 first.s.delivered.iron=4;first.ui.chooseSite('center');second.ui.chooseSite('center');
 assert.match(first.$('objective').innerHTML,/<b>4 \/ 12<\/b>/);assert.match(second.$('objective').innerHTML,/<b>0 \/ 12<\/b>/);
 assert.doesNotMatch(first.$('details').innerHTML,/data-icon="hardhat"/);assert.doesNotMatch(second.$('details').innerHTML,/data-icon="hardhat"/);
});
test('Free shared-city road cells do not complete the road lesson or conceal the need to deliver gravel',()=>{
 const {player,rival}=World.create(),s=player.create();s.paused=false;s.sites.gravel.active=true;s.sites.asphalt.active=true;
 s.roads=[player.positions.city.join(','),rival.positions.city.join(',')];
 const h=harness(player,s);h.ui.dismissTutorial();assert.match(h.$('tutorial').innerHTML,/Нужен щебень для асфальта/);
 s.city.asphalt=2;h.ui.render();assert.match(h.$('tutorial').innerHTML,/Открыто строительство дорог/);
 const at=player.positions.city,p=player.directions.map(([x,y])=>[at[0]+x,at[1]+y]).find(q=>player.canStep(at,q)&&!s.roads.includes(q.join(',')));
 assert(player.buildRoad(s,p));assert.equal(s.city.asphalt,0);h.ui.render();assert.match(h.$('tutorial').innerHTML,/Основы освоены/);
});
