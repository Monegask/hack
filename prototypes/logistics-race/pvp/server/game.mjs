import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),World=require('../../dist/race-world.js');
const SITES=['oil2','iron','copper','gravel','asphalt'],TARGETS=[...SITES,'oil','city','center'];
export function engines(seed){const w=World.create(seed);return [w.player,w.rival];}
export function newGame(seed,e=engines(seed)){const states=e.map(x=>x.create());states[1].roads=states[0].roads;return states;}
export function relink(states){states[1].roads=states[0].roads;return states;}
export function applyCommand(E,state,command,side){
 const {type}=command||{};const integer=n=>Number.isInteger(n)&&n>=1&&n<=100;
 if(type==='start'){
  if(!integer(command.truck)||!['materials','crew','haul','goal'].includes(command.kind)||!TARGETS.includes(command.target))throw Error('Invalid truck command');
  return E.start(state,command.truck,command.kind,command.target);
 }
 if(type==='stopTruck'){if(!integer(command.truck))throw Error('Invalid truck');return E.stopTruck(state,command.truck);}
 if(type==='buyTruck')return E.buyTruck(state);
 if(type==='roadToCenter')return E.roadToCenter(state);
 if(type==='road'||type==='pipe'){
  const p=command.cell;if(!Array.isArray(p)||p.length!==2||!p.every(Number.isInteger)||p[1]<0||p[1]>=E.height||p[0]<0||p[0]>=E.width||(side===0?p[0]>17:p[0]<17))throw Error('Build within your territory');
  return (type==='road'?E.buildRoad:E.buildPipeCell)(state,p);
 }
 if(type==='site'){if(!SITES.includes(command.site)||typeof command.enabled!=='boolean')throw Error('Invalid site setting');state.sites[command.site].enabled=command.enabled;return true;}
 if(type==='plant'){if(!['oil','refinery','metal','asphalt'].includes(command.plant)||typeof command.enabled!=='boolean')throw Error('Invalid production setting');state.enabled[command.plant]=command.enabled;return true;}
 if(type==='metal'){if(!['auto','iron','copper'].includes(command.mode))throw Error('Invalid metal setting');state.metalMode=command.mode;return true;}
 throw Error('Unsupported command');
}
