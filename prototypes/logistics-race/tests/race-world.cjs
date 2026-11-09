const {test}=require('node:test'),assert=require('node:assert/strict'),Base=require('../dist/engine.js'),World=require('../dist/race-world.js'),Bots=require('../dist/bot.js');
function frozen(E){const s=E.create();s.paused=false;for(const k of Object.keys(s.enabled))s.enabled[k]=false;return s;}
function advance(E,s,n){for(let i=0;i<Math.ceil(n*10);i++)E.tick(s,.1);}
const key=p=>p.join(',');
test('World engines share one 35x11 geometry and center while default solo and each state remain independent',()=>{
 const {player:p,rival:r,layout}=World.create();assert.equal(Base.width,16);assert.deepEqual(Base.positions.center,[11,4]);assert.equal(p.width,35);assert.equal(r.width,35);assert.deepEqual(p.positions.city,[1,4]);assert.deepEqual(r.positions.city,[33,6]);
 assert.deepEqual(p.positions.center,[17,5]);assert.deepEqual(r.positions.center,p.positions.center);assert.equal(layout.travelNodes.filter(n=>n.site==='center').length,1);assert.equal(p.travelFootprints.filter(n=>n.id==='center').length,1);
 for(const [id,pos] of Object.entries(p.positions))if(id!=='center')assert.deepEqual(r.positions[id],[34-pos[0],10-pos[1]]);
 for(let y=0;y<11;y++)for(let x=0;x<35;x++)assert.deepEqual(p.travelPoint([x,y]),r.travelPoint([x,y]));
 const ps=p.create(),rs=r.create();assert.notEqual(ps.city,rs.city);assert.notEqual(ps.sites,rs.sites);assert.notEqual(ps.delivered,rs.delivered);assert.equal(ps.trucks[0].position.join(','),'1,4');assert.equal(rs.trucks[0].position.join(','),'33,6');assert.deepEqual(JSON.parse(JSON.stringify(rs)),rs);
});
test('Mirrored players have equal travel cost, speed and capacity on the global board',()=>{
 const {player:p,rival:r}=World.create(42);for(const id of Object.keys(p.positions)){
  const left=p.routeInfo(p.create(),id),right=r.routeInfo(r.create(),id);assert.equal(left.capacity,right.capacity,id);assert(Math.abs(left.fuel-right.fuel)<1e-8,id+' fuel');assert(Math.abs(left.seconds-right.seconds)<1e-8,id+' time');
 }
 assert(r.initialPipeCells.some(p=>key(p)==='33,3'));assert(!r.initialPipeCells.some(p=>key(p)==='2,8'));
});
test('Both competitors physically deliver to exactly the same center without sharing order or inventory',()=>{
 const {player:p,rival:r}=World.create(),ps=frozen(p),rs=frozen(r);assert(p.start(ps,1,'goal','center'));assert(r.start(rs,1,'goal','center'));
 assert.deepEqual(ps.trucks[0].job.route.at(-1),[17,5]);assert.deepEqual(rs.trucks[0].job.route.at(-1),[17,5]);assert.equal(ps.delivered.iron,0);assert.equal(rs.delivered.iron,0);
 const rivalBefore=JSON.stringify(rs);advance(p,ps,p.routeInfo(ps,'center').seconds+.2);assert.equal(ps.delivered.iron,4);assert.equal(JSON.stringify(rs),rivalBefore);
 advance(r,rs,r.routeInfo(rs,'center').seconds+.2);assert.equal(rs.delivered.iron,4);assert.equal(ps.delivered.iron,4);assert.equal(ps.outgoing.iron,0);assert.equal(rs.outgoing.iron,0);
});
test('A shared road changes rival travel and capacity but only its builder pays for asphalt',()=>{
 const {player:p,rival:r}=World.create(),ps=frozen(p),rs=frozen(r);rs.roads=ps.roads;assert.equal(rs.roads,ps.roads);ps.city.asphalt=50;const rivalAsphalt=rs.city.asphalt,initial=ps.city.asphalt,before=r.routeInfo(rs,'iron');
 const cells=before.points.filter(q=>!r.onRoad(rs,q));for(const q of cells)assert(p.buildRoad(ps,q));
 const after=r.routeInfo(rs,'iron');assert.equal(after.capacity,8);assert(after.seconds<before.seconds);assert.equal(ps.city.asphalt,initial-cells.length*2);assert.equal(rs.city.asphalt,rivalAsphalt);assert.deepEqual(ps.delivered,{iron:0,copper:0,asphalt:0});
});
test('Bot bound to the rival engine completes its real order on the common map',()=>{
 const {rival:r}=World.create(42),B=Bots.withEngine(r),b=B.create(42);b.state.paused=false;
 for(let i=0;i<18000&&!b.state.won;i++){B.tick(b,.1);assert(b.state.fuel>=0);assert(Object.values(b.state.city).every(n=>n>=0));}
 assert(b.state.won,'bot stalled at '+b.phase);assert.deepEqual(b.state.delivered,b.state.goal);assert.deepEqual(b.state.trucks[0].job.route.at(-1),r.positions.center);
});
test('Race build injects shared-world initialization after engine and before app for web and offline',()=>{
 const {race}=require('../bot/build-race.cjs');
 for(const offline of [false,true]){const sample=offline?'<body class="three-game"><script>window.Logistics={};</script><script>function appMarker(){}</script></body>':'<body class="three-game"><script src="engine.js"></script><script src="app.js"></script></body>',html=race(sample,offline);
  assert(html.includes('data-practice="true" data-race="true"'));const world=html.indexOf(offline?'function create(seed=':'src="race-world.js"'),app=html.indexOf(offline?'function appMarker':'src="app.js"');assert(world>html.indexOf(offline?'window.Logistics={}':'src="engine.js"'));assert(world<app);
 }
});
