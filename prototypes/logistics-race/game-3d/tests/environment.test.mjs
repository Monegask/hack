import {test} from 'node:test';
import assert from 'node:assert/strict';
import E from '../../dist/engine.js';
import RaceWorld from '../../dist/race-world.js';
import Scene from '../../dist/map-scene.js';
import {createTerrainPlan,pointSegmentDistance} from '../src/terrain-layout.mjs';
import {SITE_LAYOUT} from '../src/site-layout.mjs';
import {visualCell,world} from '../src/state.mjs';
const plan=createTerrainPlan(E,Scene.models);
test('Shared mountain bowls contain extra relief and dominant tall summits while the right passage stays flat',()=>{
 const w=RaceWorld.create(42),e=w.player,terrain=createTerrainPlan(e,Scene.models),heights=e.mountainPeaks.map(p=>terrain.heightAt(p.x,p.z));
 assert(terrain.peaks.length>32);assert(Math.max(...heights)>17);assert(Math.min(...heights)<4);
 const inner=world([9.8,2.7]);assert(Math.abs(terrain.heightAt(inner.x,inner.z)-19.525)<1e-8,'Gentler shoulders must preserve the full dominant summit height');
 const toe=terrain.heightAt(.05,-6)-.025,shoulder=terrain.heightAt(3,-6)-.025;
 assert(toe<.08,'The slope must flatten gradually at its foot');assert(shoulder>toe*10,'The extended shoulder must still rise towards the crest');
 for(const cell of e.mountains){const p=world(cell);assert(terrain.heightAt(p.x,p.z)>2,'Every blocked shoulder must read as actual rock, not a flat green mound');}
 for(let x=0;x<35;x++)for(const z of x<17?[9,10]:[0,1]){const p=world([x,z]);assert.equal(terrain.heightAt(p.x,p.z),.025,'Each own-right passage must stay at ground level');}
 for(const peak of e.mountainPeaks){const peer=e.mountainPeaks.find(q=>Math.abs(q.x-(114-peak.x))<1e-8&&q.z===-peak.z);assert(peer);assert.equal(peer.height,peak.height);}
});
test('Dense forest is deterministic, clustered inside the map, with permanent yards and hub access clear',()=>{
 assert(plan.trees.length>1100&&plan.trees.length<1800);assert(plan.shrubs.length>50);assert(plan.rocks.length>30);assert.deepEqual(plan.trees,createTerrainPlan(E,Scene.models).trees);
 assert(plan.trees.filter(t=>Math.abs(t.z)<26&&Math.abs(t.x)<43).length>500);assert(plan.trees.filter(t=>t.type==='pine').length/plan.trees.length>.9);
 for(const tree of plan.trees){assert(plan.allowsTree(tree,tree.radius));for(const [a,b] of plan.access)assert(pointSegmentDistance(tree,a,b)>tree.radius+.80);assert(Number.isFinite(tree.y));}
 for(const hill of plan.hills)assert(plan.allows(hill,hill.r),'Decorative hills must leave every possible future road flat');
});
test('Mountains rise only on the existing blocked cells, with matching grounded boundary samples',()=>{
 assert.equal(plan.peaks.length,E.mountains.length);assert(Math.max(...plan.peaks.map(p=>plan.heightAt(p.x,p.z)))>4);
 for(const [a,b] of plan.boundary)for(let i=0;i<=10;i++){const t=i/10;assert(Math.abs(plan.heightAt(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t)-.025)<1e-7);}
 for(let x=0;x<16;x++)for(let z=0;z<11;z++)if(!E.mountains.some(p=>p[0]===x&&p[1]===z)){const p=world([x,z]);assert.equal(plan.heightAt(p.x,p.z),.025);}
});
test('Larger enterprises have separated presentation footprints without moving engine gates',()=>{
 assert(SITE_LAYOUT.oil.model/3.55>1.5);assert(SITE_LAYOUT.iron.model/3.85>1.5);assert(SITE_LAYOUT.gravel.model/5.5>1.5);
 const plots=Object.keys(E.positions).map(id=>({...world(visualCell(id,E,Scene.models)),...SITE_LAYOUT[id],id}));for(const [i,a] of plots.entries())for(const b of plots.slice(i+1))assert(Math.abs(a.x-b.x)>(a.width+b.width)/2+.5||Math.abs(a.z-b.z)>(a.depth+b.depth)/2+.5,a.id+' meets '+b.id);
});
