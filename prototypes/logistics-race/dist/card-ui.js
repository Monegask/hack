(function(root){
'use strict';
// Presentation only. Eligibility and cargo are calculated by the real engine on a copy.
function inspect(E,state,truckId,type,target){
 const copy=JSON.parse(JSON.stringify(state));copy.paused=false;
 const ok=E.start(copy,truckId,type,target),truck=copy.trucks.find(t=>t.id===truckId);
 return {ok,reason:ok?'':copy.notice||'Action unavailable',cargo:ok?truck.cargo:{},route:E.routeInfo(state,target)};
}
/* Pickaxe and hard-hat paths: Lucide v1.8.0.
ISC License

Copyright (c) 2026 Lucide Icons and Contributors

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
*/
const shapes={truck:'M3 6h11v11H3z M14 10h4l3 4v3h-7 M5 17v2h3v-2 M16 17v2h3v-2',iron:'M4 5l15 14 M15 3l6 6 M3 15l6 6 M8 5l8-2 5 5-2 8',copper:'M4 5l15 14 M15 3l6 6 M3 15l6 6 M8 5l8-2 5 5-2 8',gravel:'M2 19l6-12 5 6 3-8 6 14z',asphalt:'M2 21h21',oil2:'M12 2C9 7 5 10 5 14a7 7 0 0014 0c0-4-4-7-7-12z',oil:'M12 2C9 7 5 10 5 14a7 7 0 0014 0c0-4-4-7-7-12z',center:'M3 21V8l9-5 9 5v13 M7 21V11h10v10 M7 15h10',fuel:'M5 21V4h9v17 M5 9h9 M14 7h3l3 4v7a2 2 0 01-4 0v-5h-2',pickaxe:'m14 13-8.381 8.38a1 1 0 0 1-3.001-3L11 9.999 M15.973 4.027A13 13 0 0 0 5.902 2.373c-1.398.342-1.092 2.158.277 2.601a19.9 19.9 0 0 1 5.822 3.024 M16.001 11.999a19.9 19.9 0 0 1 3.024 5.824c.444 1.369 2.26 1.676 2.603.278A13 13 0 0 0 20 8.069 M18.352 3.352a1.205 1.205 0 0 0-1.704 0l-5.296 5.296a1.205 1.205 0 0 0 0 1.704l2.296 2.296a1.205 1.205 0 0 0 1.704 0l5.296-5.296a1.205 1.205 0 0 0 0-1.704z',route:'M5 3v18 M19 3v18 M12 3v3 M12 10v4 M12 18v3',plus:'M12 4v16 M4 12h16'};
// Authored asphalt-plant mark: twin storage silos and a separate tilted mixing drum.
// The shared 24-unit viewBox and currentColor outline match the existing UI icon system.
const asphaltMark='<g data-part="silos"><path d="M2.5 4c0-1.3 4-1.3 4 0v9l-2 3-2-3Z M8.5 4c0-1.3 4-1.3 4 0v9l-2 3-2-3Z M2.5 4c0 1.3 4 1.3 4 0 M8.5 4c0 1.3 4 1.3 4 0 M3 16v4 M6 16v4 M9 16v4 M12 16v4"/></g><g data-part="mixer"><path d="m15 12 5-1.5c2-.6 3.8 5.9 1 6.5l-5 1.5c-2 .6-3.8-5.9-1-6.5Z M15 12c1.4-.4 3.4 6.1 1 6.5 M15.5 19v2 M21 18v3"/></g><path data-part="plant-base" d="M1.5 21h21"/>';
const hardhatMark='<path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5 M14 6a6 6 0 0 1 6 6v3 M4 15v-3a6 6 0 0 1 6-6"/><rect x="2" y="15" width="20" height="4" rx="1"/>';
function icon(id){return '<svg data-icon="'+id+'" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">'+(id==='asphalt'?asphaltMark:id==='hardhat'?hardhatMark:'<path d="'+(shapes[id]||shapes.plus)+'"/>')+'</svg>';}
function siteIcon(state,id){const site=state.sites[id];return icon(site&&!site.active?'hardhat':['iron','copper'].includes(id)?'pickaxe':id);}
function truckPresentation(E,t){
 if(!t.job&&!t.leg)return {direction:'idle',status:'Idle',place:E.label('city'),prefix:''};
 const back=t.leg?.kind==='back',moving=Boolean(t.leg),target=t.job?.target||t.at||'city';
 return {direction:back?'back':'out',status:back?'Returning':moving?'On a trip':t.status,place:E.label(moving?target:t.at||target),prefix:moving?(back?'From: ':'To: '):''};
}
function create(ctx){
 const {E,$,fmt}=ctx;let mode='site',pending=null,notice='',reference=ctx.state();
 const tutorialKey='logistics-tutorial-v1';let tutorialActive=ctx.state().time===0,tutorialDelivered=false,tutorialWatch=null,roadHintDone=false;
 try{if(typeof localStorage!=='undefined'&&!document.body.dataset?.practice){const saved=JSON.parse(localStorage.getItem(tutorialKey));if(saved){tutorialActive=saved.active;tutorialDelivered=saved.delivered;roadHintDone=saved.roadHintDone;tutorialWatch=saved.watch||null;}}}catch{}
 function saveTutorial(){if(typeof LogisticsCoach!=='undefined')return;try{if(typeof localStorage!=='undefined'&&!document.body.dataset?.practice)localStorage.setItem(tutorialKey,JSON.stringify({active:tutorialActive,delivered:tutorialDelivered,roadHintDone,watch:tutorialWatch}));}catch{}}
 const gallery=['iron','copper','gravel','asphalt','oil2','center'];
 const short={iron:'Iron',copper:'Copper',gravel:'Quarry',asphalt:'Asphalt',oil2:'Oil well',center:'Hub'};
 const labels={materials:'Deliver materials',crew:'Send builders',haul:'Assign hauling',goal:'Deliver to hub'};
 const markup=(id,value)=>{const el=$(id);if(el._cardHTML!==value){el.innerHTML=value;el._cardHTML=value;}};
 const refresh=()=>ctx.refresh();
 function selectionAllowed(){if(ctx.canSelectSite&&!ctx.canSelectSite()){notice='Finish drawing the road or pipeline first.';refresh();return false;}return true;}
 function chooseSite(id){if(!selectionAllowed())return;if(id==='city'){notice='The city runs automatically. Open “Production & log” to manage the refinery and smelters.';refresh();return;}pending=null;mode='site';notice='';ctx.selectSite(id);refresh();}
 function animate(source){if(!source||matchMedia('(prefers-reduced-motion: reduce)').matches)return;const to=$('details').querySelector('.selected-disc');if(!to)return;const a=source.getBoundingClientRect?source.getBoundingClientRect():source,b=to.getBoundingClientRect();to.animate([{transform:'translate('+(a.x+a.width/2-b.x-b.width/2)+'px,'+(a.y+a.height/2-b.y-b.height/2)+'px) scale(.7)'},{transform:'none'}],{duration:320,easing:'cubic-bezier(.2,.8,.2,1)'});}
 function dispatch(){if(!pending?.truck)return;const p={...pending},s=ctx.state();pending.truck=null;ctx.perform(()=>{const ok=E.start(s,p.truck,p.type,p.target);if(ok){
  const site=s.sites[p.target],more=ctx.batchMaterials&&p.type==='materials'&&Object.entries(E.costs[p.target]||{}).some(([k,n])=>site.received[k]+site.incoming[k]<n);
  pending=more?{type:p.type,target:p.target,truck:null,sent:(p.sent||0)+1}:null;mode='site';ctx.selectSite(p.target);ctx.selectTruck(p.truck);notice=more?'Choose another idle truck for the remaining cargo.':'';
 }else notice=s.notice;return ok;});}
 function chooseTruck(id){if(!selectionAllowed())return;const s=ctx.state(),t=s.trucks.find(t=>t.id===id);if(!t)return;
  const source=$('fleet').querySelector('[data-truck="'+id+'"] .icon-disc')?.getBoundingClientRect();
  if(pending){const check=inspect(E,s,id,pending.type,pending.target);if(!check.ok){notice=check.reason;refresh();return;}pending.truck=id;ctx.selectTruck(id);if(!s.paused){dispatch();return;}notice='Game paused. Click “Resume & send”.';}else{mode='truck';notice='';}
  ctx.selectTruck(id);refresh();animate(source);
 }
 function begin(type){const s=ctx.state(),id=ctx.selected();if(type==='haul'&&s.trucks.some(t=>t.job?.type==='haul'&&t.job.target===id&&!t.stop)){notice='Hauling is already assigned. Manage the route through the fleet.';refresh();return;}if(type==='crew'&&!Object.entries(E.costs[id]||{}).every(([k,n])=>(s.sites[id]?.received[k]||0)+(s.sites[id]?.incoming[k]||0)>=n)){notice='Send all construction materials first.';refresh();return;}pending={type,target:ctx.selected(),truck:null};notice='';refresh();}
 function render(){const s=ctx.state();if(reference!==s){reference=s;pending=null;mode='site';notice='';tutorialDelivered=false;tutorialWatch=null;roadHintDone=false;tutorialActive=s.time===0;saveTutorial();}if(s.won)pending=null;if(pending?.truck&&!s.paused){dispatch();return;}
  markup('objective',Object.entries(s.goal).map(([k,n])=>'<div class="goal-row"><span>'+E.names[k]+'</span><b>'+fmt(s.delivered[k])+' / '+n+'</b><small class="goal-transit">In transit: '+fmt(s.outgoing[k])+'</small><div class="bar"><span style="width:'+Math.min(100,s.delivered[k]/n*100)+'%"></span></div></div>').join(''));
  markup('resources',[['fuel','Fuel',s.fuel],['iron','Iron',s.city.iron],['copper','Copper',s.city.copper],['asphalt','Asphalt',s.city.asphalt],['gravel','Gravel',s.city.gravel]].map(([k,n,v])=>'<div class="resource"><span class="resource-icon">'+(['iron','copper'].includes(k)?'<span class="ingot"><span></span><span></span><span></span></span>':icon(k==='asphalt'?'route':k))+'</span><span><small>'+n+'</small><b>'+fmt(v)+'</b></span></div>').join(''));
  markup('siteGallery',gallery.map(id=>'<button class="gallery-button '+(mode==='site'&&ctx.selected()===id?'selected':'')+'" data-site="'+id+'" aria-pressed="'+(mode==='site'&&ctx.selected()===id)+'" aria-label="'+E.label(id)+'"><span class="icon-disc">'+siteIcon(s,id)+'</span><span class="gallery-label">'+short[id]+'</span><span class="gallery-status">'+(s.sites[id]?E.siteStatus(s,id):'Order')+'</span></button>').join(''));
  const checks=pending?Object.fromEntries(s.trucks.map(t=>[t.id,inspect(E,s,t.id,pending.type,pending.target)])):{};
  markup('fleet',s.trucks.map(t=>{const eligible=!!pending&&checks[t.id].ok,active=(pending?.truck===t.id)||(!pending&&mode==='truck'&&ctx.truck()===t.id),travel=truckPresentation(E,t);
   return '<button class="truck-button '+(active?'selected ':'')+(pending?(eligible?'eligible':'unavailable'):'')+'" data-truck="'+t.id+'" data-direction="'+travel.direction+'" data-available="'+(!t.job&&!t.leg&&!s.won)+'" aria-pressed="'+active+'" aria-label="Truck '+t.id+': '+travel.status+' · '+travel.prefix+travel.place+'"><span class="icon-disc">'+icon('truck')+'<span class="truck-number">'+String(t.id).padStart(2,'0')+'</span></span><span class="truck-state-line" aria-hidden="true"></span><span class="truck-status">'+(eligible?'Select':t.stop?'Final trip':travel.status)+'</span><span class="truck-target">'+travel.prefix+travel.place+'</span></button>';
  }).join(''));
  $('fleetCount').textContent=s.trucks.filter(t=>!t.job&&!t.leg).length+' idle / '+s.trucks.length;
  $('buy').disabled=!!s.production.vehicle||s.won;$('buy').textContent=s.production.vehicle?'Assembly · '+Math.ceil(s.production.vehicle.left)+' s':'＋ Assemble truck';
  if(document.activeElement?.id!=='metalMode')markup('production',[['oil','Starting well','Oil: '+s.city.oil],['refinery','Refinery','Oil → fuel'],['metal','Smelting','Iron ore: '+s.city.ironOre+' · copper: '+s.city.copperOre],['asphalt','Asphalt plant','Gravel: '+s.city.gravel]].map(([id,n,sub])=>'<div class="plant"><div>'+n+'<small>'+sub+' · '+(s.production[id]?'working':s.enabled[id]?'waiting':'paused')+'</small></div>'+(id==='metal'?'<select id="metalMode" aria-label="Smelting priority">'+[['auto','Auto'],['iron','Iron'],['copper','Copper']].map(([v,n])=>'<option value="'+v+'" '+(s.metalMode===v?'selected':'')+'>'+n+'</option>').join('')+'</select>':'')+'<button data-plant="'+id+'" '+(id==='asphalt'&&!s.sites.asphalt.active?'disabled':'')+'>'+(s.enabled[id]?'Pause':'Start')+'</button></div>').join(''));
  const t=s.trucks.find(t=>t.id===ctx.truck()),focus=document.activeElement?.closest?.('[data-action]')?.dataset.action;
  let title,sub='',acts='',disc=ctx.selected(),path='',message=notice;
  function button(key,name,hint,disabled=false,primary=false){acts+='<button class="action-card '+(primary?'primary':'')+'" data-action="'+key+'" '+(disabled?'disabled':'')+'><strong>'+name+'</strong><small>'+hint+'</small></button>';}
  if(pending){title=E.label(pending.target);path='Choose a highlighted truck in the fleet.';
   const valid=Object.values(checks).find(c=>c.ok),r=E.routeInfo(s,pending.target);
   sub='Choose a highlighted truck to send it immediately.';
   acts='<div class="assignment-summary">'+(pending.type==='crew'?'Construction crew':pending.type==='haul'?'Repeated hauling · up to '+r.capacity+' per trip':valid?E.cargoText(valid.cargo):'No eligible truck')+'<br>Round trip: <b>'+fmt(r.fuel)+' fuel</b><br>'+fmt(r.seconds)+' s one way</div>';
   if(pending.truck&&s.paused)button('resume','Resume & send','Truck '+pending.truck+' · no extra confirmation',false,true);
   else if(s.paused)button('resume','Resume game','Then choose a truck',false,true);
   if(!valid)message=Object.values(checks).find(c=>c.reason&&!/busy/.test(c.reason))?.reason||'All trucks are busy. Wait for one to return or end a haul route.';
  }else if(mode==='truck'&&t){title='Truck '+t.id;disc='truck';sub=t.status+(t.job?' · '+E.label(t.job.target):' · in city');
   acts='<div class="assignment-summary">'+(Object.keys(t.cargo).length?E.cargoText(t.cargo):t.job?.type==='crew'?'Builders':'Empty')+'</div>';
   if(t.job?.type==='haul')button('stop',t.stop?'Ending route':'End route','Collect available cargo and return',t.stop||s.won,true);
   if(t.job)button('open-target','Open site',E.label(t.job.target));else acts+='<p class="subtle">Idle. Assign a new job through a site card.</p>';
  }else{const id=ctx.selected(),site=s.sites[id];title=E.label(id);sub=site?E.siteStatus(s,id):id==='oil'?'Automatic oil supply to the city':'Order delivery';
   if(site&&!site.active){const delivered=Object.entries(E.costs[id]).every(([k,n])=>site.received[k]>=n),covered=Object.entries(E.costs[id]).every(([k,n])=>site.received[k]+site.incoming[k]>=n);
    acts='<div class="assignment-summary">'+Object.entries(E.costs[id]).map(([k,n])=>E.names[k]+': '+site.received[k]+'/'+n+(site.incoming[k]?' · '+site.incoming[k]+' in transit':'')).join('<br>')+'</div>';
    if(!covered&&!site.construction)button('materials','Deliver materials','Deliver missing materials',s.won,true);
    const crewOnWay=s.trucks.some(t=>t.job?.type==='crew'&&t.job.target===id);
    if(covered&&!site.construction&&!crewOnWay)button('crew','Send builders',delivered?'Materials ready · choose truck':'Materials in transit · builders can leave',s.builder!==null||s.won,true);
    if(site.construction)acts+='<p>'+(delivered?'Builders are working. The site will start soon.':'Builders on site, waiting for materials.')+'</p>';
    else if(crewOnWay)acts+='<p>Builders are on the way. Construction starts when the crew and materials reach the site.</p>';
    else if(!covered)acts+='<p class="subtle">Send all materials first. Then send builders without waiting for unloading.</p>';
   }
   else if(id==='oil2'){sub+=' · stock '+site.stock+' oil';acts='<div class="assignment-summary">'+(E.pipeConnected(s)?'Pipeline connected':'Continuous pipe to city required')+'</div>';button('oil-pipe','Lay pipeline','1,5 iron / cell · on map',s.won,true);button('toggle-site',site.enabled?'Pause extraction':'Resume extraction','The paid cycle will finish',s.won);}
   else if(site&&id!=='asphalt'){sub+=' · stock '+site.stock;const assigned=s.trucks.filter(t=>t.job?.type==='haul'&&t.job.target===id&&!t.stop);if(assigned.length){button('haul-transport','Manage hauling','View truck or end route');}else button('haul','Assign hauling','Choose truck · repeat trips',s.won,true);button('toggle-site',site.enabled?'Pause extraction':'Resume extraction','Control extraction separately from transport',s.won);}
   else if(id==='asphalt'){sub+=' · gravel in storage '+s.city.gravel;button('toggle-asphalt',s.enabled.asphalt?'Pause plant':'Start plant','2 gravel → 2 asphalt',s.won,true);}
   else if(id==='center'){const route=E.routeInfo(s,'center');acts+='<div class="assignment-summary">'+(route.capacity===8?'Entrance connected · capacity 8':'Entrance not connected · capacity 4')+'<br><small>'+(route.capacity===8?'The entire route is paved.':'Connect a continuous road to the marked hub entrance. Trucks move faster on paved sections.')+'</small></div>';button('goal','Deliver to hub','Missing order cargo · single trip',s.won,true);}
   else if(id==='oil'){button('production','Production & log','Well, refinery and smelting');}
  }
  markup('details','<div class="card-path">'+path+'</div><header class="selected-header"><div class="selected-disc">'+siteIcon(s,disc)+'</div><div class="selected-heading"><h2>'+title+'</h2><p class="card-subtitle">'+sub+'</p></div></header><div class="card-orbit"><div class="action-list">'+acts+'</div></div><div class="card-message" role="status">'+message+'</div>'+(pending?'<button class="card-back" data-action="cancel">Cancel assignment</button>':''));
  renderTutorial(s);
  if(focus){const b=$('details').querySelector('[data-action="'+focus+'"]');if(b&&!b.disabled&&document.activeElement===document.body)b.focus({preventScroll:true});}
 }
 function handleAction(action){const s=ctx.state();if(['materials','crew','haul','goal'].includes(action)){begin(action);return;}
  if(action==='cancel'){notice=pending?.sent?'Remaining assignment canceled. Trucks already sent will continue their trips.':'Assignment canceled. No resources spent.';pending=null;refresh();return;}
    if(action==='resume'){$('pause').click();if(pending?.truck&&!s.paused)dispatch();return;}
  if(action==='haul-transport'){const truck=s.trucks.find(t=>t.job?.type==='haul'&&t.job.target===ctx.selected()&&!t.stop);if(truck)chooseTruck(truck.id);return;}
  if(action==='stop'){ctx.perform(()=>E.stopTruck(s,ctx.truck()));return;}
  if(action==='open-target'){chooseSite(s.trucks.find(t=>t.id===ctx.truck()).job.target);return;}
  if(action==='production'){$('operations').showModal();return;}
  if(action==='oil-pipe'){$('pipeTool').click();return;}
  ctx.perform(()=>{if(action==='toggle-site'){s.sites[ctx.selected()].enabled=!s.sites[ctx.selected()].enabled;return true;}if(action==='toggle-asphalt'){s.enabled.asphalt=!s.enabled.asphalt;return true;}return false;});
 }
 function tutorialStep(s){
  if(s.won)return {title:'Order complete!',text:'You have learned the supply chain. Inspect the result or start a new game.',target:'#objective',done:true};
  if(s.paused)return {title:s.time?'Resume the game':'Start with one delivery',text:s.time?'Click “Resume” above the map to continue this tutorial step.':'Click “Start” above the map. Then deliver materials to the iron mine.',target:'#pause'};
  if(pending&&!s.trucks.some(t=>inspect(E,s,t.id,pending.type,pending.target).ok))return {title:'No eligible truck right now',text:'The action card explains why. If all trucks are busy, cancel and wait or end a haul route through the fleet.',target:'[data-action="cancel"]'};
  if(pending)return {title:'Choose a truck',text:'Click a highlighted idle truck at the bottom right to send it on the selected job.',target:'.truck-button.eligible'};
  function build(id){const site=s.sites[id];if(site.construction)return Object.entries(E.costs[id]).every(([k,n])=>site.received[k]>=n)?{title:'Construction in progress',text:'Builders are constructing the site. Production starts when it is complete.',target:'#details'}:{title:'Builders awaiting materials',text:'The crew is on site. Construction starts after the last cargo arrives.',target:'#fleet'};if(s.trucks.some(t=>t.job?.type==='crew'&&t.job.target===id))return {title:'Builders heading to site',text:'Construction starts when the crew and all materials reach the site.',target:'#fleet'};if(!s.trucks.some(t=>!t.job&&!t.leg)){const haul=s.trucks.find(t=>t.job?.type==='haul'&&!t.stop);if(haul)return mode==='truck'&&ctx.truck()===haul.id?{title:'Free a truck',text:'Click “End route”. The truck returns to the city with available cargo.',target:'[data-action="stop"]'}:{title:'An idle truck is needed',text:'Click truck '+haul.id+' at the bottom right to recall it from hauling.',target:'[data-truck="'+haul.id+'"]'};return {title:'Wait for an idle truck',text:'Trucks will finish their trips and return to the city.',target:'#fleet'};}if(ctx.selected()!==id||mode!=='site')return {title:'Open '+E.label(id).toLowerCase(),text:'Click the highlighted site on the right or its model on the map.',target:'[data-site="'+id+'"]'};
   if(site.construction)return Object.entries(E.costs[id]).every(([k,n])=>site.received[k]>=n)?{title:'Construction in progress',text:'Builders are constructing the site. Production starts when it is complete.',target:'#details'}:{title:'Builders awaiting materials',text:'The crew is on site. Construction starts after the last cargo arrives.',target:'#fleet'};
   const delivered=Object.entries(E.costs[id]).every(([k,n])=>site.received[k]>=n),covered=Object.entries(E.costs[id]).every(([k,n])=>site.received[k]+site.incoming[k]>=n);
   if(covered)return {title:'Now send builders',text:s.builder!==null?'Builders are on another job. Wait for them to return.':(delivered?'Materials are on site. ':'All materials have been sent. ')+'Click “Send builders”, then choose an idle truck. The crew will wait for the last delivery.',target:s.builder!==null?'#fleet':'[data-action="crew"]'};
   return {title:'Deliver materials',text:'Click “Deliver materials”, then choose an idle truck. Send another trip if the load does not fit.',target:'[data-action="materials"]'};
  }
  if(!s.sites.iron.active)return build('iron');
  if(!tutorialDelivered&&!s.sites.iron.enabled&&!s.sites.iron.stock){if(ctx.selected()!=='iron'||mode!=='site')return {title:'Resume extraction',text:'Open the iron mine to enable ore production.',target:'[data-site="iron"]'};return {title:'Enable the mine',text:'Click “Resume extraction”. Then assign hauling.',target:'[data-action="toggle-site"]'};}
  if(!tutorialDelivered){const haul=s.trucks.find(t=>t.job?.type==='haul'&&t.job.target==='iron');
   if(tutorialWatch){const watched=s.trucks.find(t=>t.id===tutorialWatch.id);if(!watched?.job||watched.trip>tutorialWatch.trip){tutorialDelivered=true;tutorialWatch=null;saveTutorial();}}
   if(!tutorialDelivered&&haul){if(haul.leg?.kind==='back'&&Object.keys(haul.cargo).length&&!tutorialWatch){tutorialWatch={id:haul.id,trip:haul.trip};saveTutorial();}return {title:haul.leg?.kind==='back'?'First ore heading to the city':'Mine operational',text:'The truck waits for a full load and takes ore to the city. Smelters turn it into iron automatically.',target:'#fleet'};}
   if(!tutorialDelivered){if(ctx.selected()!=='iron'||mode!=='site')return {title:'Mine built',text:'Open the iron mine. Now assign ore hauling.',target:'[data-site="iron"]'};return {title:'Assign hauling',text:'Click “Assign hauling”, then choose a truck. Trips repeat until you end the route through the fleet.',target:'[data-action="haul"]'};}
  }
  return {title:'First cycle complete',text:'Ore has reached the city and is smelted automatically. Choose your strategy: build a copper mine and quarry. To free a truck, select it in the fleet and end its route.',target:'[data-site="copper"]',done:true};
 }
 function roadStep(s){
  const initialRoads=new Set((E.initialRoadCells||[]).map(p=>Array.isArray(p)?p.join(','):p));
  initialRoads.add(E.positions.city.join(','));
  for(const node of E.travelNodes||[])if(node.site==='city'||node.id==='city')initialRoads.add(node.position.join(','));
  const hasPaintedRoad=s.roads.some(k=>!initialRoads.has(k));
  if(pending)return {title:'Choose a truck',text:'Choose a highlighted idle truck to send it on this job.',target:'.truck-button.eligible'};
  if(!s.sites.gravel.active&&s.city.asphalt<2)return {title:'Build the quarry first',text:'Asphalt needs gravel. Open the quarry, deliver materials and send builders. Then assign hauling.',target:ctx.selected()==='gravel'?'#details':'[data-site="gravel"]'};
  if(s.paused)return {title:'Plant ready: roads available',text:'Resume to produce asphalt and build a road.',target:'#pause'};
  const gravelHaul=s.trucks.some(t=>t.job?.type==='haul'&&t.job.target==='gravel');
  if(!s.city.asphalt&&!s.production.asphalt&&!hasPaintedRoad&&!gravelHaul){if(ctx.selected()!=='gravel'||mode!=='site')return {title:'Asphalt needs gravel',text:'Open the quarry. Assign gravel hauling to the city so the plant can produce asphalt.',target:'[data-site="gravel"]'};return {title:'Deliver gravel',text:'Click “Assign hauling” and choose a truck. The asphalt plant works automatically.',target:'[data-action="haul"]'};}
  if(!roadHintDone){if(hasPaintedRoad){roadHintDone=true;saveTutorial();}else return {title:'Road construction unlocked',text:s.city.asphalt<2?'The plant is built. Wait for gravel and the first 2 asphalt. Start the plant in its card if it is paused.':'Click “Road” below the map and draw from the city across neighboring cells. Each cell costs 2 asphalt. The road must connect all the way to the site.',target:s.city.asphalt<2?'[data-site="asphalt"]':'#roadTool'};}
  return {title:'Basics complete',text:'Choose your own expansion order now. End haul routes through their trucks. Deliver the order to the hub to win.',target:'[data-site="center"]',done:true};
 }
 function renderTutorial(s){
  if(typeof LogisticsCoach!=='undefined'){if($('tutorial'))$('tutorial').hidden=true;return;}
  if(document.querySelectorAll)for(const el of document.querySelectorAll('.tutorial-focus'))el.classList.remove('tutorial-focus');
  const panel=$('tutorial');if(!panel)return;const roadContext=!tutorialActive&&!roadHintDone&&s.sites.asphalt.active&&!s.won;panel.hidden=!tutorialActive&&!roadContext;
  if(panel.hidden)return;
  const step=roadContext?roadStep(s):tutorialStep(s);
  markup('tutorial','<span class="tutorial-kicker">TUTORIAL · NEXT STEP</span><strong>'+step.title+'</strong><p>'+step.text+'</p><button data-tutorial="dismiss">'+(step.done?'Finish tutorial':'Skip tutorial')+'</button>');
  if(document.querySelectorAll)for(const el of document.querySelectorAll(step.target))el.classList.add('tutorial-focus');
 }
 function startTutorial(){tutorialActive=true;tutorialWatch=null;saveTutorial();refresh();}
 function dismissTutorial(){if(!tutorialActive&&ctx.state().sites.asphalt.active)roadHintDone=true;tutorialActive=false;saveTutorial();refresh();}
 if($('tutorial'))$('tutorial').onclick=e=>{if(e.target.closest('[data-tutorial="dismiss"]'))dismissTutorial();};
 if($('tutorialReplay'))$('tutorialReplay').onclick=startTutorial;
 $('siteGallery').onclick=e=>{const button=e.target.closest('[data-site]');if(button){const source=button.querySelector('.icon-disc')?.getBoundingClientRect();chooseSite(button.dataset.site);animate(source);}};
 $('operationsOpen').onclick=()=>$('operations').showModal();$('operationsClose').onclick=()=>$('operations').close();
 return {render,chooseSite,chooseTruck,handleAction,startTutorial,dismissTutorial,cancel:()=>{pending=null;notice='';},getPending:()=>pending,getMode:()=>mode};
}
const api={create,inspect,icon,truckPresentation};if(typeof module==='object'&&module.exports)module.exports=api;else root.LogisticsCardUI=api;
})(typeof globalThis!=='undefined'?globalThis:this);
