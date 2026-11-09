(function(root){
'use strict';
const Base=typeof module!=='undefined'?require('./engine.js'):root.Logistics;
// Spacious authored plots preserve yards and approaches for all resource types.
// Reflect one seeded draw for the rival, so luck cannot favour either side.
const resourcePlots=[[1,2],[4,2],[6,2],[6,0],[6,5],[4,5]];
function freshSeed(){return (Date.now()^Math.floor(Math.random()*4294967296))>>>0;}
function create(seed=freshSeed()){
 seed=Number(seed)>>>0;let rng=seed;
 const random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};
 const plots=resourcePlots.map(p=>[...p]);for(let i=plots.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[plots[i],plots[j]]=[plots[j],plots[i]];}
 const width=35,height=11,mirror=p=>[34-p[0],10-p[1]],reflect=p=>({x:114-p.x,z:-p.z}),world=p=>({x:(p[0]-7.5)*6,z:(p[1]-5)*6});
 const positions={oil:[1,8],city:[1,4],asphalt:[2,8],center:[17,5],...Object.fromEntries(['iron','copper','gravel','oil2'].map((id,i)=>[id,plots[i]]))};
 const rivalPositions=Object.fromEntries(Object.entries(positions).map(([id,p])=>[id,id==='center'?[...p]:mirror(p)]));
 // A bowed ridge cups each basin. Its left shoulder meets the board edge;
 // the retracted right shoulder leaves a two-row passage towards the centre.
 const spine=Array.from({length:9},(_,z)=>[Math.round(8+4*Math.sin(Math.PI*z/8)),z]);
 const ridge=spine.flatMap(([x,z],i)=>{const previous=spine[i-1]?.[0],start=z>=2&&z<=6?8:x-(x-previous>1?1:0),end=x+1+(previous-x>1?1:0);return Array.from({length:end-start+1},(_,j)=>[start+j,z]);});
 const mountains=[...ridge,...ridge.map(mirror)],worldBounds={minX:-58,maxX:170,minZ:-42,maxZ:42,centerX:56,centerZ:0,width:228,depth:84};
 // Jittered crests, varied shoulders and heights avoid a row of identical peaks.
 // Keep the same visual profile in reflection, independently of the match seed.
 const crestHeights=[3.8,6.2,11,8,14,10,7.8,5.1,3.5];
 const leftPeaks=spine.map((p,i)=>{const w=world(p);return {x:w.x+1.5+Math.sin(i*2.4)*.8,z:w.z+Math.cos(i*1.7)*.7,height:crestHeights[i],rx:7.5+(i%3)*.55,rz:6.4+(i%2)*.9};});
 // Fill the bowl behind the crest with a second, staggered mountain group.
 // Two dominant summits stand well above the medium peaks and low foothills.
 for(const [x,z,height,rx,rz] of [[9.8,2.7,19.5,8.3,7.7],[10.1,5.3,16.5,8.7,7.1],[9.3,4.5,8,7.2,6.2],[10.5,3.8,12.7,7.5,6.8],[9.1,2.3,6,6.2,5.8],[9.2,6,5,6.6,5.5],[10.3,6.5,8,6.2,5.4]])leftPeaks.push({...world([x,z]),height,rx,rz});
 for(const peak of leftPeaks){peak.rx*=1.3;peak.rz*=1.15;}
 // Every low shoulder is an unmistakable rocky outcrop, rather than a green
 // mound on an inexplicably blocked cell. High crests keep their long slopes.
 const primaryPeaks=[...leftPeaks];
 for(const [i,p] of ridge.entries()){
  const at=world(p),height=Math.max(...primaryPeaks.map(q=>q.height*Math.max(0,1-Math.hypot((at.x-q.x)/q.rx,(at.z-q.z)/q.rz))**1.25));
  if(height<6.5)leftPeaks.push({x:at.x+Math.sin(i*2.7)*.32,z:at.z+Math.cos(i*1.9)*.32,height:4+(i*7%5)*.5,rx:2.65+(i%3)*.08,rz:2.55+(i%2)*.12,foot:true});
 }
 const mountainPeaks=[...leftPeaks,...leftPeaks.map(p=>({...p,...reflect(p)}))];
 const travelAnchors=Object.fromEntries(Object.entries(positions).filter(([id])=>id!=='city'&&id!=='center').map(([id,p])=>[id,id==='oil'?[...Base.travelAnchors.oil]:[54+p[0]*56,44+p[1]*54]]));
 const rivalAnchors=Object.fromEntries(Object.entries(travelAnchors).map(([id,p])=>[id,[2012-p[0],628-p[1]]]));
 const travelNodes=[];
 for(const [id,p] of Object.entries(positions)){
  const gate=world(p),hub=id==='city'||id==='center',at=travelAnchors[id],point=hub?{x:gate.x-2.83*1.15,z:gate.z+7.9}:world([(at[0]-54)/56,(at[1]-44)/54]);
  travelNodes.push({id:id==='center'?'center':'player:'+id,owner:id==='center'?'shared':'player',site:id,position:p,point,size:Base.travelSizes[id],hub,mirror:false,...(hub?{gate}:{})});
  // The existing hub model sits off its gate axis. Reserve its mirrored envelope
  // too, otherwise the same central yard gives one side a shorter approach.
  if(id==='center')Object.assign(travelNodes.at(-1),{clearancePoint:{x:gate.x,z:point.z},clearanceSize:[Base.travelSizes.center[0]+2*Math.abs(gate.x-point.x),Base.travelSizes.center[1]],clearanceCopies:[{x:gate.x,z:-point.z}]});
  if(id!=='center')travelNodes.push({id:'rival:'+id,owner:'rival',site:id,position:rivalPositions[id],point:reflect(point),size:Base.travelSizes[id],hub,mirror:hub?'rotate':false,...(hub?{gate:world(rivalPositions[id])}:{})});
 }
 const common={width,height,initialRoadCells:[positions.city.join(','),rivalPositions.city.join(',')],mountains,mountainPeaks,travelNodes,travelSizes:Base.travelSizes,projectionPins:[],worldBounds};
 const initialPipeCells=Array.from({length:5},(_,i)=>[1,8-i]);
 const player=Base.createForWorld({...common,positions,travelAnchors,initialPipeCells});
 const rival=Base.createForWorld({...common,positions:rivalPositions,travelAnchors:rivalAnchors,hubMirrors:{city:'rotate'},initialPipeCells:initialPipeCells.map(mirror),directions:Base.directions.map(([x,z])=>[-x,-z])});
 return {player,rival,layout:{...common,seed,version:7,resourcePlots:resourcePlots.map(p=>[...p]),positions,rivalPositions,travelFootprints:player.travelFootprints,sharedCenter:positions.center}};
}
if(typeof module!=='undefined')module.exports={create};else {const engines=create(root.document?.body?.dataset?.training==='true'?42:undefined);root.globalRaceWorldEngines=engines;root.Logistics=engines.player;}
})(typeof globalThis!=='undefined'?globalThis:this);
