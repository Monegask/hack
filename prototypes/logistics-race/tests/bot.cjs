const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const E=require('../dist/engine.js'),B=require('../dist/bot.js');
test('Medium bot completes 50 seeded games from real resources without fuel debt',()=>{
 const times=[];
 for(let seed=1;seed<=50;seed++){
  const b=B.create(seed);b.state.paused=false;
  for(let i=0;i<12000&&!b.state.won;i++){
   B.tick(b,.1);
   assert(b.state.fuel>=0);assert(Object.values(b.state.city).every(n=>n>=0));
  }
  assert(b.state.won,'seed '+seed+' stalled at '+b.phase);
  assert.deepEqual(b.state.delivered,b.state.goal);assert.equal(b.state.trucks.length,3);
  assert.equal(b.state.roads.length,0);assert.equal(b.state.sites.oil2.active,false);
  times.push(b.state.time);
 }
 console.log('Bot finish seconds, 50 seeds:',Math.round(Math.min(...times)),Math.round(Math.max(...times)),'mean',Math.round(times.reduce((a,b)=>a+b)/times.length));
});
test('Bot pause and JSON round trip preserve deterministic continuation',()=>{
 const b=B.create(42),before=JSON.stringify(b);B.tick(b,.1);assert.equal(JSON.stringify(b),before);
 b.state.paused=false;for(let i=0;i<1800;i++)B.tick(b,.1);
 const restored=JSON.parse(JSON.stringify(b));
 for(let i=0;i<5500;i++){B.tick(b,.1);B.tick(restored,.1);}
 assert.deepEqual(restored,b);assert(b.state.won);
});
function raceHarness(){
 const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,{textContent:'',innerHTML:'',disabled:false,showModal(){this.open=true;},querySelector(q){return get(id+q);}});return elements.get(id);};
 const c=vm.createContext({console,Date,Math,document:{createElement(){return {innerHTML:'',textContent:'',querySelector(){return null;}};},head:{appendChild(){}},querySelector(q){if(q==='aside')return {prepend(){}};return get(q);}}});
 for(const file of ['engine.js','bot.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist',file),'utf8'),c);
 vm.runInContext('const E=Logistics,$=id=>document.querySelector(id);let state=E.create(),winShown=false;function render(){};const fmt=String,time=String;',c);
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/bot-race.js'),'utf8'),c);
 return code=>vm.runInContext(code,c);
}
test('Race clocks, shared pause, bot victory and restart are independent of solo save',()=>{
 const run=raceHarness();
 assert.equal(run('E.tick(state,.1);rival.state.time'),0);
 run('state.paused=false;for(let i=0;i<100;i++)E.tick(state,.1)');
 assert.equal(run('state.time'),run('rival.state.time'));
 run('state.paused=true;E.tick(state,.1)');assert.equal(run('state.time'),run('rival.state.time'));
 run('state.paused=false;for(let i=0;i<12000&&!raceResult;i++)E.tick(state,.1)');
 assert.equal(run('raceResult'),'Bot wins');assert(run('state.paused'));assert.equal(run('state.won'),false);
 assert(run('rival.state.won'));assert(run("$('pause').disabled"));
 run('state=E.create();render()');assert.equal(run('rival.state.time'),0);assert.equal(run('raceResult'),null);
});
test('Race resolves human victory and same-step tie',()=>{
 for(const tie of [false,true]){
  const run=raceHarness();
  run(`state.paused=false;const finish=s=>{s.delivered={iron:12,copper:6,asphalt:7};s.outgoing.asphalt=1;const t=s.trucks[0];t.cargo={asphalt:1};t.job={type:'goal',target:'center',route:[E.positions.city,E.positions.center]};t.leg={kind:'out',points:[E.positions.city,E.positions.center],costs:[.1],elapsed:0};};finish(state);${tie?'finish(rival.state);':''}E.tick(state,.1);`);
  assert.equal(run('raceResult'),tie?'Draw':'You win!');assert(run('state.won'));
 }
});
test('Race web and autonomous pages isolate saves and include both bot modules',()=>{
 for(const file of ['../dist/bot-race.html','../logistics-race-bot.html']){
  const html=fs.readFileSync(path.join(__dirname,file),'utf8');
  assert(html.includes('data-practice="true" data-race="true"'));
  assert(file.includes('/dist/')?html.includes('src="bot-race.js"'):html.includes('function raceReset()'));
  if(!file.includes('/dist/'))assert(!/<script src=/.test(html));
 }
});
