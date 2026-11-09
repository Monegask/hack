import {roadEdges,networkPoint,world} from './state.mjs';
import {pointSegmentDistance} from './terrain-layout.mjs';

export function clearanceSegments(territories,models){
 const out=[];
 for(const {state:s,engine:E} of territories){if(!s)continue;
  for(const [a,b] of roadEdges(s,E))out.push([networkPoint(a,E,models),networkPoint(b,E,models),.98]);
  for(const t of s.trucks)if(t.leg)for(let i=1;i<t.leg.points.length;i++)out.push([networkPoint(t.leg.points[i-1],E,models),networkPoint(t.leg.points[i],E,models),.98]);
  for(const [a,b] of E.pipeEdges(s))out.push([{...world(a),z:world(a).z+.78},{...world(b),z:world(b).z+.78},.30]);
 }
 return out;
}
export const treeIsClear=(tree,segments)=>!segments.some(([a,b,width])=>pointSegmentDistance(tree,a,b)<tree.radius+width);
export const clearanceKey=territories=>JSON.stringify(territories.map(({state:s})=>s&&[s.roads,s.pipeCells,s.trucks.map(t=>t.leg?.points)]));
