const {test}=require('node:test'),assert=require('node:assert/strict'),E=require('../dist/engine.js');
test('A complete game can be won from the real opening without granting resources',()=>{
 const s=E.create();s.paused=false;
 const wait=condition=>{for(let i=0;!condition()&&i<18000;i++)E.tick(s,.1);assert(condition(),'Timed out: '+JSON.stringify({time:s.time,fuel:s.fuel,city:s.city}));};
 const idle=()=>s.trucks.every(t=>!t.job);
 const build=id=>{
  while(!Object.entries(E.costs[id]).every(([k,n])=>s.sites[id].received[k]>=n)){
   for(const t of s.trucks)E.start(s,t.id,'materials',id);
   wait(idle);
  }
  assert(E.start(s,1,'crew',id));wait(idle);
 };
 const harvest=(id,amount)=>{
  const site=s.sites[id];site.enabled=true;
  for(const t of s.trucks)assert(E.start(s,t.id,'haul',id));
  const total=()=>site.stock+(s.city[id+'Ore']||0)+(s.city[id]||0)+s.trucks.reduce((n,t)=>n+(t.cargo[id+'Ore']||t.cargo[id]||0),0)+(id==='gravel'?s.city.asphalt+(s.production.asphalt?2:0):s.production.metal?.kind===id?2:0);
  wait(()=>total()>=amount);site.enabled=false;
  for(const t of s.trucks)E.stopTruck(s,t.id);
  wait(idle);
 };
 build('iron');harvest('iron',24);
 build('copper');harvest('copper',12);
 build('gravel');build('asphalt');harvest('gravel',8);
 wait(()=>s.city.asphalt>=8);
 while(!s.won){
  for(const t of s.trucks)if(!t.job)E.start(s,t.id,'goal','center');
  wait(()=>s.won||idle());
 }
 assert.deepEqual(s.delivered,s.goal);assert(s.fuel>=0);
 console.log('Sequential reference victory:',Math.round(s.time),'seconds; fuel:',s.fuel.toFixed(2));
});
