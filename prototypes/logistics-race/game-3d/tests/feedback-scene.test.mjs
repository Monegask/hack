import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import E from '../../dist/engine.js';
import Scene from '../../dist/map-scene.js';
import {world,visualCell,networkPoint,connectionCell,truckPose,roadEdges,dirtEdges,ROAD_WIDTH,LANE} from '../src/state.mjs';
import {SITE_LAYOUT} from '../src/site-layout.mjs';
import {createTerrainPlan,pointSegmentDistance} from '../src/terrain-layout.mjs';
import {hubApproach} from '../src/hub-layout.mjs';
const models=Scene.models,near=(a,b)=>assert(Math.abs(a-b)<1e-6,`${a} vs ${b}`);

test('Road projection is one continuous non-inverted grid, preserves map limits and stays outside mountains',()=>{
 const project=p=>networkPoint(p,E,models);
 for(let x=0;x<15;x++)for(let z=0;z<10;z++){
  const a=project([x,z]),b=project([x+1,z]),c=project([x,z+1]),d=project([x+1,z+1]);
  for(const [p,q,r] of [[a,b,c],[b,d,c]])assert((q.x-p.x)*(r.z-p.z)-(q.z-p.z)*(r.x-p.x)>0,`inverted quad ${x},${z}`);
 }
 for(let z=0;z<11;z++)for(const x of [0,15])near(project([x,z]).x,world([x,z]).x);
 for(let x=0;x<16;x++)for(const z of [0,10])near(project([x,z]).z,world([x,z]).z);
 for(let x=0;x<16;x++)for(let z=0;z<11;z++)for(const [dx,dz] of [[1,0],[0,1],[1,1],[1,-1]]){
  const a=[x,z],b=[x+dx,z+dz];if(!E.canStep(a,b))continue;const p=project(a),q=project(b);
  for(let i=0;i<=20;i++){const at={x:p.x+(q.x-p.x)*i/20,z:p.z+(q.z-p.z)*i/20};assert(!E.mountains.some(m=>{const c=world(m);return Math.abs(at.x-c.x)<2.95&&Math.abs(at.z-c.z)<2.95;}));}
 }
});

test('Each visible construction yard and finished enterprise is the real loading and road-paint endpoint',()=>{
 const s=E.create();s.paused=false;
 for(const id of ['iron','copper','gravel','asphalt','oil2']){
  const at=world(visualCell(id,E,models));assert.deepEqual(networkPoint(E.positions[id],E,models),at);assert.deepEqual(connectionCell(at,E,models,SITE_LAYOUT),E.positions[id]);
  const points=E.path(s,E.positions.city,E.positions[id]),costs=points.slice(1).map((p,i)=>Math.hypot(p[0]-points[i][0],p[1]-points[i][1])*4),leg={points,costs,elapsed:costs.reduce((a,b)=>a+b,0)},t={id:1,job:{target:id},leg};
  const before=JSON.stringify([s,t]);const p=truckPose(s,t,0,0,E,models);near(Math.hypot(p.x-at.x,p.z-at.z),LANE);assert.equal(JSON.stringify([s,t]),before);
  s.sites[id].active=true;assert.deepEqual(truckPose(s,t,0,0,E,models),p);
 }
});

test('Moving trucks stay on exactly the same rendered paved route, including a winding route near a hub',()=>{
 const s=E.create();s.paused=false;s.roads=Object.keys(E.positions).filter(id=>id!=='city').map(id=>E.positions[id].join(','));
 const points=[[3,8],[3,7],[2,7],[1,7]],costs=[2,2,2],leg={points,costs,elapsed:0},t={id:1,job:{},leg};
 const paths=[hubApproach(world(E.positions.city),1),points.map(p=>networkPoint(p,E,models))],segments=paths.flatMap(path=>path.slice(1).map((p,i)=>[path[i],p]));
 for(let time=0;time<=6;time+=.01){leg.elapsed=time;const p=truckPose(s,t,0,0,E,models);assert(Math.min(...segments.map(([a,b])=>pointSegmentDistance(p,a,b)))<ROAD_WIDTH/2,`truck off asphalt at ${time}`);}
 // The route contains no saved-state writes, so existing mid-leg saves keep their timing.
 const copy=JSON.stringify(t);for(let n=0;n<10;n++)truckPose(s,t,n/10,0,E,models);assert.equal(JSON.stringify(t),copy);
});

test('Mountains and their footprint margin contain no trees or shrubs; dirt tracks are never painted',()=>{
 const plan=createTerrainPlan(E,models);
 for(const tree of [...plan.trees,...plan.shrubs])for(const m of E.mountains){const p=world(m);assert(Math.abs(tree.x-p.x)>=3+(tree.radius||.13)+.4||Math.abs(tree.z-p.z)>=3+(tree.radius||.13)+.4);}
 const s=E.create();s.paused=false;assert(E.start(s,1,'materials','iron'));assert.deepEqual(dirtEdges(s,E),[]);
 const source=fs.readFileSync(new URL('../src/view.mjs',import.meta.url),'utf8');assert(source.includes('this.options.roadMode?connectionCell'));assert(source.includes('roads(s,this.E,this.models)'));assert(source.includes('truckPose(s,t,extra,rig.group.rotation.y,this.E,this.models)'));
});
