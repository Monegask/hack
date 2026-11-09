(function(root){
'use strict';
const defaultEngine=typeof module!=='undefined'?require('./engine.js'):root.Logistics;
function withEngine(E){
const engineTick=E.tick;
const stages=[['build','iron'],['fleet','city'],['harvest','iron'],['build','copper'],['harvest','copper'],['build','gravel'],['build','asphalt'],['harvest','gravel'],['deliver','center']];
function create(seed=1){return {version:1,seed:seed>>>0,phase:0,next:0,decisions:0,last:'Ожидает старта',state:E.create()};}
function random(b){b.seed=(Math.imul(b.seed,1664525)+1013904223)>>>0;return b.seed/4294967296;}
function inventory(s,id){
 const ore=id==='gravel'?'gravel':id+'Ore';
 return s.city[id]+(ore===id?0:s.city[ore])+s.sites[id].stock+
 s.trucks.reduce((n,t)=>n+(t.cargo[id]||0)+(ore===id?0:t.cargo[ore]||0),0)+
 (id==='gravel'?s.city.asphalt+(s.production.asphalt?2:0):(s.production.metal?.kind===id?2:0));
}
function needed(s,id){
 if(id==='gravel')return s.goal.asphalt;
 return s.goal[id]+Object.entries(E.costs).filter(([site])=>site!=='oil2'&&!s.sites[site].active)
 .reduce((n,[site,cost])=>n+Math.max(0,cost[id]-s.sites[site].received[id]-s.sites[site].incoming[id]),0);
}
function decide(b){
 const s=b.state,[task,id]=stages[b.phase],idle=s.trucks.filter(t=>!t.job&&!t.leg),site=s.sites[id];
 const send=(type,target)=>{
  if(!idle.length||s.fuel<E.routeInfo(s,target).fuel+.6)return false;
  if(E.start(s,idle[0].id,type,target)){b.last=E.label(target)+': '+({materials:'подвоз материалов',crew:'строители',haul:'вывоз сырья',goal:'поставка заказа'}[type]);return true;}return false;
 };
 if(task==='build'){
  if(site.active){b.phase++;return;}
  const ready=Object.entries(E.costs[id]).every(([k,n])=>site.received[k]+site.incoming[k]>=n);
  if(!ready)send('materials',id);else if(!site.construction&&s.builder===null)send('crew',id);
 }
 if(task==='fleet'){
  if(s.trucks.length>=3){b.phase++;return;}
  if(!s.production.vehicle&&s.fuel>=1&&E.buyTruck(s))b.last='Сборка третьего грузовика';
 }
 if(task==='harvest'){
  const enough=inventory(s,id)>=needed(s,id);
  // Production switches are the same controls available to the human player.
  site.enabled=!enough&&s.fuel>.75;
  if(enough){
   const t=s.trucks.find(t=>t.job?.type==='haul'&&t.job.target===id&&!t.stop);
   if(t){E.stopTruck(s,t.id);b.last='Завершает вывоз: '+E.label(id);}
   else if(idle.length===s.trucks.length){
    if(inventory(s,id)-site.stock>=needed(s,id))b.phase++;
    else if(send('haul',id))E.stopTruck(s,idle[0].id);
   }
  }else if(!s.trucks.some(t=>t.stop))send('haul',id);
 }
 if(task==='deliver'){
  s.enabled.asphalt=s.city.asphalt+s.outgoing.asphalt+s.delivered.asphalt<s.goal.asphalt;
  send('goal','center');
 }
 s.notice='';
}
function tick(b,dt){
 if(b.state.paused||b.state.won)return;
 engineTick(b.state,dt);
 if(!b.state.won&&b.state.time+1e-8>=b.next){decide(b);b.decisions++;b.next=b.state.time+5+random(b)*7;}
}
function status(b){return b.state.won?'Заказ доставлен':({build:'Строит: ',harvest:'Добывает: ',fleet:'Расширяет парк: ',deliver:'Снабжает: '}[stages[b.phase][0]])+E.label(stages[b.phase][1]);}
return {create,tick,status,inventory,needed,withEngine};
}
const api=withEngine(defaultEngine);
if(typeof module!=='undefined')module.exports=api;root.LogisticsBot=api;
})(typeof globalThis!=='undefined'?globalThis:this);
