import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const require=createRequire(import.meta.url),Original=require('../.baseline-server/race-world.cjs'),Current=require('../../dist/race-world.js');
let routes=0;
for(let seed=0;seed<20;seed++){
 const a=Original.create(seed),b=Current.create(seed);
 for(const side of ['player','rival']){
  const old=a[side],engine=b[side],state=engine.create();
  const roadSets=[state.roads.slice(),[...state.roads,'2,4','3,4','4,4'],state.roads.slice()];
  for(const roads of roadSets){state.roads=roads;
   for(const target of Object.values(engine.positions))for(const diagonal of [true,false]){
    const expected=old.path(state,old.positions.city,target,diagonal),actual=engine.path(state,engine.positions.city,target,diagonal);assert.deepEqual(actual,expected);routes++;
    // Cached values are isolated from callers and restored states with equal roads.
    if(actual?.length)actual[0][0]=999;
    assert.deepEqual(engine.path(structuredClone(state),engine.positions.city,target,diagonal),expected);
   }
  }
 }
}
const result={reference:'0e13688',seeds:20,sides:2,roadSets:3,routes,exact:true};fs.writeFileSync(new URL('./results/routes.json',import.meta.url),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
