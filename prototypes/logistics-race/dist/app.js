'use strict';
const E=Logistics,$=id=>document.getElementById(id),saveKey='logistics-race-v1';
const demoMode=document.body.dataset.demo==='true',practiceMode=document.body.dataset.practice==='true';
let state=demoMode?MapScene.demoState():E.create(),selected='iron',selectedTruck=1,speed=1,roadMode=false,pipeMode=false,dragging=false,held=false,mapSignature='',winShown=false,toastTimer;
let storageAvailable=true;
let cardUI=null,coach=null;
try{const data=demoMode||practiceMode?null:JSON.parse(localStorage.getItem(saveKey));if(data?.version===1&&Array.isArray(data.trucks)&&data.city&&data.sites&&data.production&&data.enabled&&data.stats&&Array.isArray(data.roads)&&Array.isArray(data.log)){state=E.upgrade(data);state.paused=true;state.notice='';}}catch{storageAvailable=false;}
const fmt=n=>Number(n).toLocaleString('en-US',{maximumFractionDigits:1}),time=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(Math.floor(n%60)).padStart(2,'0');
function html(id,value){if($(id)._html!==value){$(id).innerHTML=value;$(id)._html=value;}}
function toast(text){if(!text)return;$('toast').textContent=text;$('toast').style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').style.display='none',4200);}
function save(){if(demoMode||practiceMode)return;try{localStorage.setItem(saveKey,JSON.stringify(state));}catch{if(storageAvailable)toast('Saving unavailable. Keep this page open until the game ends.');storageAvailable=false;}}
function perform(fn){const ok=fn();if(!ok&&state.notice)toast(state.notice);state.notice='';render();save();}
function choose(id){if(roadMode||pipeMode)return;if(cardUI){cardUI.chooseSite(id);return;}selected=id;roadMode=false;pipeMode=false;$('pipeTool').classList.remove('active');$('roadTool').classList.remove('active');render();}
const Scene=MapScene,xy=Scene.xy,mapClocks={},truckHeadings={};
const map3d=typeof Map3D!=='undefined'?new Map3D.View($('map'),{onSelect:choose,onTruck:id=>{if(cardUI){cardUI.chooseTruck(id);return;}selectedTruck=id;render();},onCell:p=>perform(()=>(pipeMode?E.buildPipeCell:E.buildRoad)(state,p)),onBuildEnd:()=>{if(state.notice)toast(state.notice);state.notice='';render();save();}}):null;
if(map3d&&document.body.dataset.training==='true'&&typeof globalRaceWorldEngines!=='undefined'){
 const idleOpponent=globalRaceWorldEngines.rival.create();idleOpponent.paused=true;
 map3d.setRivalState(idleOpponent,0,globalRaceWorldEngines.rival);map3d.focusTerritory('both');
}
function targetNode(x,y,target){if(map3d&&(roadMode||pipeMode))return null;const id=target?.closest?.('[data-node]')?.dataset.node||map3d?.nodeAt(x,y);return id?{dataset:{node:id}}:null;}
function terrain(){return Scene.terrain(state,{selected,roadMode,pipeMode});}
function drawMap(){if(map3d){map3d.update(state,{selected,selectedTruck,roadMode,pipeMode,extra:state.paused?0:acc});return;}$('map').classList.toggle('building',roadMode||pipeMode);const signature=JSON.stringify([state.roads,Object.keys(E.positions).map(id=>state.sites[id]||id==='oil'?E.siteStatus(state,id):''),state.pipeCells,selected,roadMode,pipeMode]);if(signature!==mapSignature){$('map').innerHTML=terrain();mapSignature=signature;}
 for(const id of Object.keys(E.positions)){const el=$('stock-'+id);if(!el)continue;
 const site=state.sites[id];let text='';
 if(site?.active&&id!=='asphalt')text=(id==='oil2'?'Oil':id==='gravel'?'Gravel':id==='iron'?'Fe-ore':'Cu-ore')+': '+site.stock;
 if(id==='asphalt'&&site.active)text='City storage: '+state.city.asphalt+' asph.';
 if(id==='oil')text='Oil at refinery: '+state.city.oil;
 el.textContent=text;}
 drawTrucks();}
function drawTrucks(){if(map3d){map3d.update(state,{selected,selectedTruck,roadMode,pipeMode,extra:state.paused?0:acc});return;}Scene.update($('map'),state,{selectedTruck,extra:state.paused?0:acc,clocks:mapClocks,headings:truckHeadings});}
function render(){
 const cameraHelp=document.querySelector('.camera-help');if(map3d&&cameraHelp)cameraHelp.textContent=roadMode||pipeMode?'Draw: left drag · rotate: right drag · pan: middle drag · zoom: wheel. Exit the tool to select objects.':'Select: click · zoom: wheel · rotate: left drag · pan: right drag';
 $('clock').textContent=time(state.time);$('pause').textContent=state.won?'Complete':state.paused?(state.time?'Resume':'Start'):'Pause';$('pause').disabled=state.won;
 if(!cardUI)html('resources',[['fuel','Fuel',state.fuel],['iron','Iron',state.city.iron],['copper','Copper',state.city.copper],['asphalt','Asphalt',state.city.asphalt],['gravel','Gravel',state.city.gravel]].map(([k,n,v])=>`<div class="resource ${k}"><i class="resource-icon"></i><div><span>${n}</span><br><b>${fmt(v)}</b></div></div>`).join(''));
 html('objective',Object.entries(state.goal).map(([k,n])=>`<div class="goal-row"><span>${E.names[k]}</span><b>${state.delivered[k]} / ${n}${state.outgoing[k]?' · '+state.outgoing[k]+' in transit':''}</b><div class="bar"><span style="width:${state.delivered[k]/n*100}%"></span></div></div>`).join(''));
 if(!held){
  if(cardUI){cardUI.render();}else{
  const t=state.trucks.find(t=>t.id===selectedTruck),r=E.routeInfo(state,selected),site=state.sites[selected];let body=`<span class="tag">${site?(site.active?'SITE OPERATIONAL':'CONSTRUCTION PLAN'):selected==='center'?'DESTINATION':'STARTING INFRASTRUCTURE'}</span><h2>${E.label(selected)}</h2>`;
  if(selected!=='city')body+=`<p>${r.points.length-1} cells · ${fmt(r.seconds)} s one way<br>Round trip: <b>${fmt(r.fuel)} fuel</b> · capacity ${r.capacity}</p>`;
  if(site&&!site.active){body+=`<p>${Object.entries(E.costs[selected]).map(([k,n])=>`${E.names[k]}: <b>${site.received[k]}/${n}</b>${site.incoming[k]?' (+'+site.incoming[k]+' in transit)':''}`).join('<br>')}</p><div class="action-buttons"><button data-action="materials">Deliver materials · truck ${selectedTruck}</button><button class="team-card entity-card" draggable="${state.builder===null&&!state.won}" data-action="crew"><span class="entity-heading"><i></i>BUILDERS</span><span class="entity-art"><img src="assets/builders.png" alt="" draggable="false"></span><span class="entity-info"><strong>${state.builder?'On a job · truck '+state.builder:'Builders ready'}</strong><span>${state.builder?'Wait for a truck to return':'Send with truck '+selectedTruck}</span><span class="entity-hint">${state.builder?'Builders will return to the city':'Click or drag onto a site'}</span></span><span class="grip" aria-hidden="true">⠿</span></button></div>`;if(site.construction)body+='<p>'+E.siteStatus(state,selected)+'</p>';}
  else if(selected==='oil2')body+=`<p>Stock: <b>${site.stock} oil</b><br>Output: 12 oil / min · cost: 1.5 fuel / min.</p><p>${E.pipeConnected(state)?'Pipeline connected: up to 12 oil / min reaches the refinery automatically.':'Oil accumulates at the well. Draw a continuous pipeline to the city. Each cell costs 1.5 iron. Trucks cannot carry oil.'}</p><div class="action-buttons"><button data-action="oil-pipe">Draw pipeline · 1.5 iron/cell</button><button data-action="toggle-site">${site.enabled?'Pause extraction':'Resume extraction'}</button></div>`;
  else if(site&&selected!=='asphalt')body+=`<p>At deposit: <b>${site.stock}</b> · ${site.enabled?'extraction enabled':'extraction paused'}</p><div class="action-buttons"><button data-action="haul" class="primary">Assign hauling · truck ${selectedTruck}</button><button data-action="toggle-site">${site.enabled?'Pause extraction':'Resume extraction'}</button></div><p class="subtle">The truck waits for a full load and repeats trips. “End route” collects a partial load and returns to the city.</p>`;
  else if(selected==='center')body+='<div class="action-buttons"><button data-action="goal" class="primary">Send available cargo</button><button data-action="road-center">Build road along route</button></div><p class="subtle">Only resources still needed for the order are loaded. Each delivery is one trip; send the next manually.</p>';
  else if(selected==='asphalt')body+='<p>2 gravel → 2 asphalt per 4 seconds, costing 0.11 fuel.<br>Road asphalt is deducted from storage immediately.</p><button data-action="toggle-asphalt">'+(state.enabled.asphalt?'Pause plant':'Start plant')+'</button>';
  else if(selected==='oil')body+='<p>The well is already connected to the refinery. No truck needed. Output: 1 oil / 10 s.</p>';
  else body+='<p>Shared storage, refinery, smelters and truck workshop. Ore is processed automatically; manage priorities below.</p>';
  if(t?.job)body+='<p class="subtle">This truck is busy. Choose another or wait for it to return.</p>';
  html('details',body);
  html('fleet',state.trucks.map(t=>`<div class="fleet-item"><button class="truck-card entity-card ${t.id===selectedTruck?'selected':''} ${t.job?'is-busy':''}" data-truck="${t.id}" draggable="false" data-available="${!t.job&&!state.won}" aria-pressed="${t.id===selectedTruck}" aria-label="Truck ${t.id}: ${t.status}"><span class="entity-heading"><i></i>TRUCK ${String(t.id).padStart(2,'0')}</span><span class="entity-art"><img src="assets/truck-v2.png" alt="" draggable="false"></span><span class="entity-info"><strong>${t.status}</strong><span>${t.job?E.label(t.job.target):'Ready for a job'}</span><span class="entity-cargo">${Object.keys(t.cargo).length?E.cargoText(t.cargo):'Empty'}</span><span class="entity-hint">${t.stop?'Final trip → city':t.job?'Returns after the job':state.won?'Game finished':'Select or drag'}</span></span><span class="grip" aria-hidden="true">⠿</span></button>${t.job?.type==='haul'&&!t.stop?`<button class="route-stop" data-stop="${t.id}">End route</button>`:''}</div>`).join(''));
  $('fleetCount').textContent=state.trucks.filter(t=>!t.job).length+' idle / '+state.trucks.length;
  $('buy').disabled=!!state.production.vehicle||state.won;$('buy').textContent=state.production.vehicle?'Assembly · '+Math.ceil(state.production.vehicle.left)+' s':'＋ Assemble truck';
  html('production',[['oil','Starting well','1 oil / 10 s'],['refinery','Refinery','0,11 fuel / cycle · oil: '+state.city.oil],['metal','Smelter','0,147 fuel / cycle · ore: iron '+state.city.ironOre+' · copper '+state.city.copperOre],['asphalt','Asphalt plant',state.sites.asphalt.active?'0,11 fuel / cycle · gravel: '+state.city.gravel:'Not built yet']].map(([id,title,sub])=>`<div class="plant"><div>${title}<small>${sub} · ${state.production[id]?'working':state.enabled[id]?'waiting':'paused'}</small></div>${id==='metal'?`<select id="metalMode" aria-label="Metal priority"><option value="auto" ${state.metalMode==='auto'?'selected':''}>Auto</option><option value="iron" ${state.metalMode==='iron'?'selected':''}>Iron</option><option value="copper" ${state.metalMode==='copper'?'selected':''}>Copper</option></select>`:''}<button data-plant="${id}" ${id==='asphalt'&&!state.sites.asphalt.active?'disabled':''}>${state.enabled[id]?'Pause':'Start'}</button></div>`).join(''));
 }
 }
 let guide;
 if(state.won)guide='<b>Goal reached in '+time(state.time)+'</b>Try a new game: compare buying a third truck early with building a road.';
 else if(!state.sites.iron.active)guide='<b>01 / Start iron extraction</b>Select the iron mine and deliver 5 iron + 1 copper. Each truck carries 4 units, so you can use both. Once all materials are sent, send builders on a separate trip; they can wait for the cargo.';
 else if(!state.sites.copper.active)guide='<b>02 / Secure metal supplies</b>Assign iron ore hauling. Prepare the copper mine: 5 iron + 1 copper, then builders. Do not spend your last copper on extra trucks.';
 else if(!state.sites.gravel.active)guide='<b>03 / Set up asphalt production</b>The quarry costs 2 iron + 1 copper. End a haul route when you need its truck for another job; it returns after the trip.';
 else if(!state.sites.asphalt.active)guide='<b>04 / Start the asphalt plant</b>Deliver 4 iron + 2 copper, then builders. Once built, assign gravel hauling from the quarry.';
 else guide='<b>05 / Time to supply the hub</b>Deliver metal and asphalt to the hub. Or build a road first: a fully paved route doubles capacity. Pause unnecessary extraction to save fuel.';
 if(state.fuel<1)guide='<b>Low fuel</b>Pause unnecessary extraction and production. Check the refinery: its next cycle needs 2 oil and 0.11 fuel. The chain can stall if fuel runs out; you can restart the game.';
 html('guide',guide);html('journal',state.log.slice(0,12).map(e=>`<div class="logline"><time>${time(e.t)}</time><span>${e.text}</span></div>`).join(''));drawMap();if(coach)coach.render();
 if(state.won&&!winShown){winShown=true;$('winText').textContent='Time: '+time(state.time)+'. Trucks: '+state.trucks.length+'. Road: '+state.roads.length+' cells. Fuel remaining: '+fmt(state.fuel)+'.';$('win').showModal();}
}
$('mapView').onclick=()=>{if(map3d){$('mapView').textContent=map3d.frameAll()?'Sites':'Full map';return;}const map=$('map'),full=map.getAttribute('viewBox')==='0 0 960 660';map.setAttribute('viewBox',full?'0 100 960 560':'0 0 960 660');$('mapView').textContent=full?'Full map':'Zoom in';};
$('pause').onclick=()=>{state.paused=!state.paused;acc=0;render();save();};$('speed').onclick=()=>{speed=speed===1?2:speed===2?4:1;$('speed').textContent=speed+'×';};
$('buy').onclick=()=>perform(()=>E.buyTruck(state));$('reset').onclick=()=>$('restart').showModal();$('cancelReset').onclick=()=>$('restart').close();$('confirmReset').onclick=()=>{state=demoMode?MapScene.demoState():E.create();selected='iron';selectedTruck=1;speed=1;roadMode=false;pipeMode=false;$('pipeTool').classList.remove('active');mapSignature='';winShown=false;$('speed').textContent='1×';$('roadTool').classList.remove('active');$('restart').close();save();render();};
$('introClose').onclick=()=>$('intro').close();$('winClose').onclick=()=>$('win').close();
$('fleet').onclick=e=>{if(suppressCardClick){suppressCardClick=false;return;}const stop=e.target.closest('[data-stop]');if(stop){perform(()=>E.stopTruck(state,Number(stop.dataset.stop)));return;}const card=e.target.closest('[data-truck]');if(card){if(cardUI){cardUI.chooseTruck(Number(card.dataset.truck));return;}selectedTruck=Number(card.dataset.truck);render();}};
$('details').onclick=e=>{const action=e.target.closest('[data-action]')?.dataset.action;if(!action)return;if(cardUI){cardUI.handleAction(action);return;}perform(()=>{
 if(['materials','crew','haul','goal'].includes(action))return E.start(state,selectedTruck,action,selected);
 if(action==='oil-pipe'){$('pipeTool').click();return true;}
 if(action==='road-center')return E.roadToCenter(state);
 if(action==='toggle-site'){state.sites[selected].enabled=!state.sites[selected].enabled;return true;}
 if(action==='toggle-asphalt'){state.enabled.asphalt=!state.enabled.asphalt;return true;}
});};
$('production').onclick=e=>{const id=e.target.closest('[data-plant]')?.dataset.plant;if(id){state.enabled[id]=!state.enabled[id];render();save();}};
$('production').onchange=e=>{if(e.target.id==='metalMode'){state.metalMode=e.target.value;save();}};
$('pipeTool').onclick=()=>{pipeMode=!pipeMode;roadMode=false;$('roadTool').classList.remove('active');$('pipeTool').classList.toggle('active',pipeMode);render();if(pipeMode)toast('Pipeline: start at the city or second well, including diagonals. Each cell costs 1.5 iron. Wheel: zoom; right drag: rotate.');};
$('roadTool').onclick=()=>{pipeMode=false;$('pipeTool').classList.remove('active');roadMode=!roadMode;$('roadTool').classList.toggle('active',roadMode);mapSignature='';render();if(roadMode)toast('Draw from the city across neighboring cells. Each costs 2 asphalt. Wheel: zoom; right drag: rotate.');};
function cellAt(e){const pt=$('map').createSVGPoint();pt.x=e.clientX;pt.y=e.clientY;const p=pt.matrixTransform($('map').getScreenCTM().inverse());return [Math.round((p.x-54)/56),Math.round((p.y-44)/54)];}
if(!map3d){
$('map').addEventListener('pointerdown',e=>{if(roadMode||pipeMode){dragging=true;$('map').setPointerCapture(e.pointerId);perform(()=>(pipeMode?E.buildPipeCell:E.buildRoad)(state,cellAt(e)));}else{const node=e.target.closest('[data-node]');if(node)choose(node.dataset.node);}});
$('map').addEventListener('pointermove',e=>{if(dragging&&(roadMode||pipeMode)){(pipeMode?E.buildPipeCell:E.buildRoad)(state,cellAt(e));drawMap();}});
$('map').addEventListener('pointerup',()=>{dragging=false;if(state.notice)toast(state.notice);state.notice='';render();save();});
$('map').addEventListener('pointercancel',()=>{dragging=false;save();});
$('map').addEventListener('keydown',e=>{const id=e.target.closest('[data-node]')?.dataset.node;if(id&&(e.key==='Enter'||e.key===' ')){e.preventDefault();choose(id);}});
}
$('details').addEventListener('dragstart',e=>{if(cardUI){e.preventDefault();return;}if(e.target.closest('[data-action="crew"]')){if(state.builder!==null||state.won){e.preventDefault();return;}e.dataTransfer.setData('text/plain','builders');e.dataTransfer.effectAllowed='move';held=true;}});
$('fleet').addEventListener('dragstart',e=>{if(cardUI){e.preventDefault();return;}const card=e.target.closest('[data-truck]');if(!card)return;const id=Number(card.dataset.truck),t=state.trucks.find(t=>t.id===id);if(!t||t.job||state.won){e.preventDefault();return;}selectedTruck=id;held=true;e.dataTransfer.setData('text/plain','truck:'+id);e.dataTransfer.effectAllowed='move';});
document.addEventListener('dragend',()=>{held=false;render();});
$('map').addEventListener('dragover',e=>e.preventDefault());$('map').addEventListener('drop',e=>{e.preventDefault();held=false;if(cardUI)return;const id=targetNode(e.clientX,e.clientY,e.target)?.dataset.node,data=e.dataTransfer.getData('text/plain');if(!id)return;if(data==='builders'){choose(id);perform(()=>E.start(state,selectedTruck,'crew',id));}else if(/^truck:\d+$/.test(data)){selectedTruck=Number(data.split(':')[1]);choose(id);toast('Truck '+selectedTruck+' selected. Assign a job in a site card.');$('details').scrollIntoView({behavior:'smooth',block:'nearest'});}});
document.addEventListener('pointerdown',()=>held=true);document.addEventListener('pointerup',()=>{held=false;});document.addEventListener('pointercancel',()=>held=false);
document.addEventListener('visibilitychange',()=>{if(document.hidden){state.paused=true;save();render();}});window.addEventListener('pagehide',save);
let last=performance.now(),acc=0,lastRender=0,lastSave=0;
function frame(now){const dt=Math.min(.25,(now-last)/1000);last=now;if(!document.hidden&&!state.paused){acc+=dt*speed;while(acc>=.1){E.tick(state,.1);if(coach)coach.observe();acc-=.1;if(state.paused){acc=0;break;}}}else acc=0;drawTrucks();if(coach)coach.frame();if(now-lastRender>250){render();lastRender=now;}if(now-lastSave>5000){save();lastSave=now;}requestAnimationFrame(frame);}
if(typeof LogisticsCardUI!=='undefined'&&$('siteGallery')){
 cardUI=LogisticsCardUI.create({E,$,fmt,batchMaterials:true,state:()=>state,selected:()=>selected,truck:()=>selectedTruck,canSelectSite:()=>!roadMode&&!pipeMode,selectTruck:id=>{selectedTruck=id;},selectSite:id=>{selected=id;roadMode=false;pipeMode=false;$('pipeTool').classList.remove('active');$('roadTool').classList.remove('active');},refresh:()=>render(),perform,confirmRoad:cost=>{const dialog=$('roadConfirm');$('roadConfirmText').textContent='Build a road to the hub for '+fmt(cost)+' asphalt?';dialog.showModal();}});
 $('roadConfirmCancel').onclick=()=>$('roadConfirm').close();$('roadConfirmBuild').onclick=()=>{$('roadConfirm').close();perform(()=>E.roadToCenter(state));};
}
if(cardUI&&typeof LogisticsCoach!=='undefined')coach=LogisticsCoach.mount({E,state:()=>state,view:()=>({selected,truck:selectedTruck,mode:cardUI.getMode(),pending:cardUI.getPending(),drawing:pipeMode?'pipe':roadMode?'road':null,operations:$('operations').open}),projectCell:(p,type)=>map3d?.projectCell(p,type),projectSite:id=>map3d?.projectSite(id),overview:()=>map3d?.focusTerritory('both'),makeRoom:(ids,top)=>map3d?.makeTutorialRoom(ids,top),refresh:()=>render(),focus:()=>{if(typeof focusRaceTerritory==='function')focusRaceTerritory('player');else if(map3d){if(map3d.rival)map3d.focusTerritory('player');else{map3d.full=false;map3d.fit();}}}});
render();if(state.time===0&&!cardUI)$('intro').showModal();requestAnimationFrame(frame);

let cardDrag=null,suppressCardClick=false;
$('fleet').addEventListener('pointerdown',e=>{if(cardUI)return;const card=e.target.closest('[data-truck]');if(!card||card.dataset.available!=='true'||e.button!==0)return;cardDrag={id:Number(card.dataset.truck),x:e.clientX,y:e.clientY,card,ghost:null};});
document.addEventListener('pointermove',e=>{if(!cardDrag)return;const d=cardDrag;if(!d.ghost&&Math.hypot(e.clientX-d.x,e.clientY-d.y)>7){d.ghost=d.card.cloneNode(true);d.ghost.removeAttribute('data-truck');Object.assign(d.ghost.style,{position:'fixed',width:'130px',zIndex:'1000',pointerEvents:'none',opacity:'.85',transform:'rotate(-4deg)'});document.body.appendChild(d.ghost);}if(d.ghost){e.preventDefault();held=true;d.ghost.style.left=(e.clientX-65)+'px';d.ghost.style.top=(e.clientY-45)+'px';}},{passive:false});
document.addEventListener('pointerup',e=>{if(!cardDrag)return;const d=cardDrag;cardDrag=null;if(d.ghost){d.ghost.remove();suppressCardClick=true;setTimeout(()=>suppressCardClick=false,0);const node=targetNode(e.clientX,e.clientY,document.elementFromPoint(e.clientX,e.clientY));if(node){selectedTruck=d.id;choose(node.dataset.node);toast('Truck '+selectedTruck+' selected. Assign a job in a site card.');$('details').scrollIntoView({behavior:'smooth',block:'nearest'});}held=false;render();}});
document.addEventListener('pointercancel',()=>{cardDrag?.ghost?.remove();cardDrag=null;held=false;});
