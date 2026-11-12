(function(root){
'use strict';
// A disposable visual copy. Neither commands, UI eligibility nor the result
// ever read this state. Fixed-step prediction is bounded on network loss.
function create(ticks,{delay=.3,maxPrediction=1}={}){
 let samples=[],latest=null,head=0,last=null,source=null,visual=null;
 function receive(snapshot,now){
  if(!snapshot.states)return;
  const row={time:snapshot.states[0].time,states:structuredClone(snapshot.states),now,playing:snapshot.phase==='playing'&&!snapshot.recovering};
  if(!latest||row.time<latest.time-1){samples=[];source=null;visual=null;head=Math.max(0,row.time-delay);last=now;}
  samples.push(row);samples=samples.slice(-12);latest=row;
 }
 function sample(now){
  if(!latest)return null;
  const dt=last===null?0:Math.max(0,Math.min(.1,(now-last)/1000));last=now;
  if(!latest.playing){if(source!==latest){source=latest;visual=structuredClone(latest.states);}head=latest.time;return {states:visual,extra:0,time:head};}
  const target=latest.time+Math.min(maxPrediction,Math.max(0,(now-latest.now)/1000))-delay;
  head+=Math.min(Math.max(0,target-head),dt*1.1);
  const row=samples.findLast(s=>s.time<=head+1e-7)||samples[0];
  if(source!==row){source=row;visual=structuredClone(row.states);}
  // The shared road network remains shared inside the disposable copy.
  visual[1].roads=visual[0].roads;
  for(let i=0;i<2;i++){
   let steps=0;while(visual[i].time+.1<=head+1e-7&&!visual[i].paused&&!visual[i].won&&steps++<30)ticks[i](visual[i],.1);
  }
  return {states:visual,extra:Math.max(0,Math.min(.1,head-visual[0].time)),time:head};
 }
 return {receive,sample};
}
const api={create};if(typeof module==='object'&&module.exports)module.exports=api;else root.SupplyLinePvpPresentation=api;
})(globalThis);
