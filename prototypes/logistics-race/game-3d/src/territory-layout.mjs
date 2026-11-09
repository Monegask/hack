// Two independent engine worlds share one presentation camera and WebGL context.
export const TERRITORY_OFFSET=116;
export function territoryOffset(rival=false){return {x:rival?TERRITORY_OFFSET:0,z:0};}
export function territoryCamera(mode,aspect=1,E){
 if(E?.width>16){
  const both=mode==='both',rival=mode==='rival',base=(E.positions.city[0]-7.5)*6,other=114-base,center=(E.positions.center[0]-7.5)*6;
  return {target:{x:both?E.worldBounds.centerX:((rival?other:base)+center)/2,y:.5,z:0},half:both?Math.max(104,48/aspect):Math.max(60,43/aspect),offset:{x:rival?160:-160,y:135,z:0}};
 }
 const both=mode==='both',span=E?.width>16?114:TERRITORY_OFFSET,x=both?span/2:mode==='rival'?span:0;
 return {target:{x,y:.5,z:E?.width>16&&!both?10:0},half:both?Math.max(53,125/aspect):E?.width>16?Math.max(32,58/aspect):Math.max(46,75/aspect)};
}
export function playerGround(point,E){const b=E?.worldBounds||{minX:-58,maxX:58,minZ:-42,maxZ:42};return point.x>=b.minX&&point.x<=b.maxX&&point.z>=b.minZ&&point.z<=b.maxZ;}
export function projectTerritoryPoint(point,rival=false){return {...point,x:point.x+(rival?TERRITORY_OFFSET:0)};}
export function territoryHeadingPoint(E,rival=false,sceneX=0){return E?.width>16?{x:rival?E.worldBounds.maxX+3:E.worldBounds.minX-3,y:1,z:0}:{x:sceneX,y:1,z:-34};}

export function overviewLabel(id){return {iron:'Железо',copper:'Медь',gravel:'Карьер',asphalt:'Асфальт',city:'Город',center:'Хаб',oil:'Скважина',oil2:'Скважина 2'}[id]||id;}
