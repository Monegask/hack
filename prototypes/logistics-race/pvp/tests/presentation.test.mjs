import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {engines,newGame} from '../server/game.mjs';
const require=createRequire(import.meta.url),{create}=require('../client/presentation.cjs');
function world(){const es=engines(42),states=newGame(42);for(let i=0;i<2;i++){states[i].paused=false;states[i].sites.iron.active=true;states[i].sites.iron.stock=100;assert.equal(es[i].start(states[i],1,'haul','iron'),true);}return {es,states};}
test('visual trucks and production advance at frame cadence between sparse snapshots without mutating authority',()=>{
 const {es,states}=world(),visual=create(es.map(e=>e.tick)),before=structuredClone(states);visual.receive({states,phase:'playing'},0);
 let changed=0,prior=-1,priorTime=-1;
 for(let ms=0;ms<700;ms+=1000/60){const frame=visual.sample(ms),elapsed=frame.states[0].trucks[0].leg.elapsed+frame.extra;if(elapsed>prior+1e-6)changed++;assert(frame.time>=priorTime);prior=elapsed;priorTime=frame.time;}
 assert(changed>=20,'Motion should change at frame cadence, not only at snapshot cadence');assert.deepEqual(states,before);
 for(let ms=700;ms<2000;ms+=1000/60)visual.sample(ms);
 const stopped=visual.sample(10000),later=visual.sample(20000);assert(stopped.time<=states[0].time+.7+1e-6);assert.equal(later.time,stopped.time);
});
test('visual reconciliation stays monotonic, handles complete trips and freezes on server pause',()=>{
 const {es,states}=world(),visual=create(es.map(e=>e.tick));let nextSnapshot=0,nextTick=100,last=-1;
 for(let ms=0;ms<40000;ms+=1000/60){
  while(ms>=nextTick){for(let i=0;i<2;i++)es[i].tick(states[i],.1);nextTick+=100;}
  if(ms>=nextSnapshot){visual.receive({states,phase:'playing'},ms);nextSnapshot+=250;}
  const frame=visual.sample(ms);assert(frame.time>=last-1e-7);last=frame.time;assert(frame.states[0].time<=states[0].time+.3);assert.notEqual(frame.states[0],states[0]);
 }
 states.forEach(s=>s.paused=true);visual.receive({states,phase:'refund'},40000);const a=visual.sample(40000),b=visual.sample(42000);assert.equal(a.time,b.time);assert.deepEqual(a.states,b.states);
});
