// Loaded after the existing offline app. Only the server may mutate gameplay.
'use strict';
const pvpConfig=window.__supplyLinePvp;
let pvpSnapshot=null,pvpSequence=0,pvpQueue=Promise.resolve(),pvpPollBusy=false,pvpFailed=false,pvpFocused=false;
const pvpEngineMethods=['start','stopTruck','buyTruck','roadToCenter','buildRoad','buildPipeCell'];
function pvpPost(command){
 const id=crypto.randomUUID();pvpQueue=pvpQueue.then(async()=>{
  if(pvpFailed)throw Error('Refresh the match to restore command sequence');
  const sequence=pvpSequence+1;
  const request={id,sequence,command};
  // Retry the SAME id and sequence after an uncertain HTTP response.
  for(let attempt=0;attempt<3;attempt++){
   try{const r=await fetch('/api/matches/'+pvpConfig.code+'/command',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':pvpConfig.csrf},body:JSON.stringify(request)});const value=await r.json();if(!r.ok){if(![429,502,503,504].includes(r.status))pvpFailed=true;throw Error(value.error||'Command rejected');}pvpSequence=value.sequence;if(value.notice)toast(value.notice);await pvpPoll();return;}
   catch(e){if(pvpFailed||attempt===2){pvpFailed=true;throw e;}await new Promise(r=>setTimeout(r,500*(attempt+1)));}
  }
 }).catch(e=>{toast(e.message);});return true;
}
for(const name of pvpEngineMethods)E[name]=(_s,...args)=>{
 const command=name==='start'?{type:'start',truck:args[0],kind:args[1],target:args[2]}:name==='stopTruck'?{type:'stopTruck',truck:args[0]}:name==='buildRoad'?{type:'road',cell:args[0]}:name==='buildPipeCell'?{type:'pipe',cell:args[0]}:{type:name};
 return pvpPost(command);
};
E.tick=()=>{};save=()=>{};coach=null;winShown=true;
const pvpBasePerform=perform;
perform=function(fn){
 const beforeSites=Object.fromEntries(Object.entries(state.sites).map(([id,s])=>[id,s.enabled])),beforeEnabled={...state.enabled};
 pvpBasePerform(fn);
 for(const [site,enabled] of Object.entries(beforeSites))if(state.sites[site].enabled!==enabled){const next=state.sites[site].enabled;state.sites[site].enabled=enabled;pvpPost({type:'site',site,enabled:next});}
 for(const [plant,enabled] of Object.entries(beforeEnabled))if(state.enabled[plant]!==enabled){const next=state.enabled[plant];state.enabled[plant]=enabled;pvpPost({type:'plant',plant,enabled:next});}
};
$('production').onclick=e=>{const plant=e.target.closest('[data-plant]')?.dataset.plant;if(plant)pvpPost({type:'plant',plant,enabled:!state.enabled[plant]});};
$('production').onchange=e=>{if(e.target.id==='metalMode')pvpPost({type:'metal',mode:e.target.value});};
const pvpStatus=document.createElement('span');pvpStatus.id='pvpStatus';pvpStatus.setAttribute('role','status');pvpStatus.textContent='Connecting to match server…';document.querySelector('.map-top .controls').prepend(pvpStatus);
const pvpHome=document.createElement('button');pvpHome.id='pvpHome';pvpHome.textContent='Match & payouts';pvpHome.onclick=()=>window.parent===window?location.assign('/pvp/'):window.parent.postMessage({type:'supply-line-pvp-home'},location.origin);document.querySelector('.map-top .controls').append(pvpHome);
const pvpBaseRender=render;
render=function(){pvpBaseRender();$('pause').disabled=true;$('pause').textContent=pvpSnapshot?.phase==='playing'?'Online · 1×':'Server paused';$('speed').hidden=true;$('reset').hidden=true;$('intro').close();$('restart').close();};
$('pause').onclick=()=>{};$('speed').onclick=()=>{};$('confirmReset').onclick=()=>{};
for(const button of document.querySelectorAll('.map-top button'))if(button.textContent.trim()==='Tutorial')button.hidden=true;
document.querySelector('.prototype-note').textContent='TESTNET PvP · The server runs this match at 1×. Commands and the winner are verified on the server. No real money.';
async function pvpPoll(){
 if(pvpPollBusy)return;pvpPollBusy=true;
 try{
  const response=await fetch('/api/matches/'+pvpConfig.code);const value=await response.json();if(!response.ok)throw Error(value.error);
  pvpSnapshot=value;if(value.states){state=value.states[pvpConfig.side];pvpSequence=Math.max(pvpSequence,value.lastSequence);winShown=true;acc=0;
   // The build swaps engine roles for player two, so the opposite engine is always .rival.
   map3d?.setRivalState(value.states[1-pvpConfig.side],0,globalRaceWorldEngines.rival);if(!pvpFocused){map3d?.focusTerritory('both');pvpFocused=true;}render();
  }
  pvpStatus.textContent=value.recovering?'Waiting for both players to reconnect':value.phase==='playing'?'TESTNET · Connected':'TESTNET · '+value.phase;
 }catch{pvpStatus.textContent='Connection lost · reconnecting';}finally{pvpPollBusy=false;}
}
render();pvpPoll();setInterval(pvpPoll,750);
