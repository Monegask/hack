import * as T from 'three';
import {networkPoint} from './state.mjs';
export function selectedRoutePoints(s,selected,E,models,drawing=false){
 const truck=s.trucks.find(t=>t.id===selected);
 return drawing||!truck?.leg?[]:truck.leg.points.map(p=>({...networkPoint(p,E,models),y:.17}));
}
export function activeRoute(points){
 const group=new T.Group();if(points.length<2)return group;
 const geometry=new T.BufferGeometry().setFromPoints(points.map(p=>new T.Vector3(p.x,p.y,p.z)));
 const line=new T.Line(geometry,new T.LineDashedMaterial({color:0xe6eee8,dashSize:.74,gapSize:.48,transparent:true,opacity:.95,depthWrite:false}));line.computeLineDistances();line.renderOrder=3;group.add(line);return group;
}
