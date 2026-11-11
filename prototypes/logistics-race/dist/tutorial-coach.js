(function(root){
'use strict';
const KEY='logistics-coach-v2';
const INTRO_COUNT=3;
const make=(id,title,text,target,more={})=>({id,title,text,target,...more});
const overlap=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
const clamp=(v,a,b)=>Math.max(a,Math.min(v,Math.max(a,b)));
function placement(target,map,viewport,poseHint,bubbleHeight){
 const compact=viewport.width<640,bw=Math.min(compact?276:300,viewport.width-24),bh=bubbleHeight||(compact?190:205);let sz=compact?108:174;
 const bounds={x:Math.max(8,map.x),y:Math.max(8,map.y),width:Math.min(map.width,viewport.width-16),height:Math.min(map.y+map.height,viewport.height-8)-Math.max(8,map.y)};
 const tx=target.x+target.width/2,ty=target.y+target.height/2;
 let pose=tx>bounds.x+bounds.width/2?'right':'left';
 let x=pose==='right'?target.x-sz-20:target.x+target.width+20,y=ty-sz*.42;
 if(poseHint==='peek'){pose='peek';x=bounds.x+bounds.width-sz-8;y=bounds.y+8;}
 if(poseHint==='up'){pose='up';x=tx-sz*.72;y=target.y+target.height+14;}
 if(poseHint==='folded'){pose='folded';sz=Math.min(sz,Math.max(64,target.y-bounds.y-20));x=tx-sz/2;y=target.y-sz-14;}
 x=clamp(x,bounds.x+4,bounds.x+bounds.width-sz-4);y=clamp(y,bounds.y+8,viewport.height-sz-8);
 if(overlap({x,y,width:sz,height:sz},target)){y=target.y+target.height+sz+24<viewport.height?target.y+target.height+16:target.y-sz-16;y=clamp(y,8,viewport.height-sz-8);}
 const character={x,y,width:sz,height:sz};
 const candidates=[{x:x-bw-10,y:y+12},{x:x+sz+10,y:y+12},{x:bounds.x+12,y:y+sz+12},{x:bounds.x+12,y:y-bh-12},{x:bounds.x+12,y:bounds.y+Math.max(8,bounds.height-bh-12)}];
 let bubble=candidates.map(p=>({x:clamp(p.x,12,Math.min(viewport.width,bounds.x+bounds.width)-bw-12),y:clamp(p.y,12,viewport.height-bh-12),width:bw,height:bh})).find(p=>!overlap(p,target)&&!overlap(p,character));
 if(!bubble)bubble={x:12,y:clamp(target.y+target.height+18,12,viewport.height-bh-12),width:bw,height:bh};
 return {character,bubble,pose};
}
function sampleCells(E,s,type){
 const copy=JSON.parse(JSON.stringify(s));copy.paused=false;copy.won=false;copy.city.iron=1e4;copy.city.asphalt=1e4;
 const isPipe=type==='pipe',built=isPipe?E.onPipe:E.onRoad,build=isPipe?E.buildPipeCell:E.buildRoad;
 for(const target of (isPipe?['oil2']:['iron','center'])){const points=E.path(copy,E.positions.city,E.positions[target]);let cells=[];for(let i=0;i<points.length;i++){const p=points[i];if(built(copy,p)){if(!cells.length)cells=[p];else if(cells.length===1)cells[0]=p;continue;}if(build(copy,p)){cells.push(p);if(cells.length===4)return cells;}else if(cells.length>1)break;}if(cells.length>1)return cells;}
 return [];
}
function snapshot(s){return {metal:s.production.metal?{...s.production.metal}:null,ore:s.city.ironOre,pipeLeft:s.oilPipe?.left,oilStock:s.sites.oil2.stock,trucks:s.trucks.map(t=>({id:t.id,trip:t.trip,type:t.job?.type,target:t.job?.target,stop:t.stop,leg:t.leg?.kind,cargo:t.cargo?.ironOre||0})),delivered:{...s.delivered}};}
function observe(f,old,s){
 if(!old)return;
 const m=s.production.metal;
 if(old.metal?.kind==='iron'&&(!m||m.kind!=='iron'||m.left>old.metal.left+.001))f.producedIron=true;
 for(const t of old.trucks){const n=s.trucks.find(n=>n.id===t.id);if(!n)continue;
  if(t.type==='haul'&&t.target==='iron'&&t.leg==='back'&&t.cargo&&(!n.job||n.trip>t.trip))f.oreReturned=true;
  if(t.type==='haul'&&t.target==='iron'&&t.stop&&!n.job)f.recalled=true;
 }
 if(s.city.ironOre>old.ore||s.production.metal?.kind==='iron')f.oreReturned=true;
 if(old.oilStock>0&&s.oilPipe?.left>old.pipeLeft+.001)f.pipeFlow=true;
 if(Object.keys(s.goal).some(k=>s.delivered[k]>old.delivered[k]))f.delivered=true;
}
function buildStep(E,s,v,id){
 const site=s.sites[id],label=E.label(id),free=s.trucks.some(t=>!t.job&&!t.leg);
 if(site.active)return null;
 if(site.construction||s.trucks.some(t=>t.job?.type==='crew'&&t.job.target===id))return make('build-wait-'+id,site.construction?'Builders on site':'Builders in transit','Construction starts when both the crew and all materials arrive. The truck then returns to the city.','#fleet',{site:id});
 if(!free){const haul=s.trucks.find(t=>t.job?.type==='haul'&&!t.stop);return haul?make('need-truck','An idle truck is needed','Open this truck and end its haul route. It returns with available cargo.',v.mode==='truck'&&v.truck===haul.id?'[data-action="stop"]':'[data-truck="'+haul.id+'"]'):make('wait-truck','Trucks returning','Wait for a truck to return: construction materials and builders travel separately.','#fleet');}
 if(v.selected!==id||v.mode!=='site')return make('select-'+id,'Open '+label.toLowerCase(),'Select the site on the map or its icon on the right to see the construction requirements.','[data-site="'+id+'"]',{site:id});
 const covered=Object.entries(E.costs[id]).every(([k,n])=>site.received[k]+site.incoming[k]>=n);
 if(covered)return make('crew-'+id,'Now send the construction crew','All materials are delivered or in transit. Click “Send builders”, then choose an idle truck.','[data-action="crew"]');
 const cost=Object.entries(E.costs[id]).map(([k,n])=>n+' '+E.names[k].toLowerCase()).join(' and '),capacity=E.routeInfo(s,id).capacity;
 return make('materials-'+id,'Deliver materials',id==='iron'?'Deliver materials to the mine to build it. You need 5 iron and 1 copper.':label+': '+cost+'. Capacity here: '+capacity+'. Send another load if it does not fit. Builders go next.','[data-action="materials"]');
}
function pendingStep(E,s,v){
 if(!v.pending)return null;
 const suitable=s.trucks.some(t=>{if(t.job||t.leg)return false;const copy=JSON.parse(JSON.stringify(s));copy.paused=false;return E.start(copy,t.id,v.pending.type,v.pending.target);});
 if(!suitable)return make('no-eligible','Trip unavailable','Check the reason in the card. Check fuel and cargo; if trucks are busy, cancel the assignment and wait for one to return.','[data-action="cancel"]');
 return make('pick-truck','Choose a truck',v.pending.type==='materials'?(s.trucks.some(t=>t.job?.type==='materials'&&t.job.target===v.pending.target)?'Assign another truck to deliver materials faster. Once there are enough, we will send builders.':'Choose a truck for this delivery. You can carry up to 4 units off-road.'):s.paused?'Choose an idle truck. Then click “Resume & send”.':'Click an eligible truck to send it immediately. Fuel for the round trip is consumed immediately.','.truck-button.eligible',v.pending.type==='crew'?{pose:'peek'}:{});
}
function step(E,s,v,p,f){
 if(s.won)return make('won','Order delivered','The hub has received the full order. View the result or start a new game.','#objective',{finish:true});
 if(p.chapter==='menu')return make('menu','What would you like to learn?','Learn the basics in this game or open a separate training map. Your current jobs and save are kept.','#tutorialReplay',{menu:true,hold:true});
 const intro=[
  make('intro-goal','Supply the hub to win','The first player to deliver the following to the hub wins: '+s.goal.iron+' iron, '+s.goal.copper+' copper and '+s.goal.asphalt+' asphalt.','[data-site="center"]',{site:'center'}),
  make('intro-stock','Starting resources','The top bar shows your starting resources. Use fuel, iron and copper wisely: supplies are limited until you start production.','#resources',{pose:'up'}),
  make('intro-city','Processing','The city has a refinery and smelters that process raw materials. The first oil well is already connected and supplies your starting fuel.','[data-site="city"]',{site:'city',mapSites:['city','oil'],pose:'folded'})
 ];
 if(p.chapter==='core'&&p.intro<INTRO_COUNT)return {...intro[p.intro],manual:true,hold:true,count:(p.intro+1)+'/'+INTRO_COUNT};
 if(p.chapter==='road'&&p.intro===0)return make('road-intro','Road building available','Roads make trucks faster. Capacity increases from 4 to 8 only with a continuous road from the city to the site entrance. Click “Road”, hold the left mouse button and drag across neighboring cells around mountains. Diagonals are allowed. Each new cell costs 2 asphalt immediately; no deliveries or builders are needed. Click “Road” again to exit.','#roadTool',{manual:true,hold:true});
 if(p.chapter==='pipe'&&p.intro===0)return make('pipe-intro','Consider the entire chain first','The second well supplies more oil to the city refinery. Deliver materials and builders first, then connect it to the city with a continuous pipeline. Trucks cannot carry oil. Each new pipe cell costs 1.5 iron and is built instantly, without deliveries or builders.','#pipeTool',{manual:true,hold:true});
 if(v.drawing&&p.chapter!=='road'&&p.chapter!=='pipe')return make('exit-drawing','Return to object selection','Click the active tool again. Site and truck selection are disabled while drawing.',v.drawing==='pipe'?'#pipeTool':'#roadTool');
 const pending=pendingStep(E,s,v);if(pending)return pending;
 if(s.paused)return make('resume',s.time?'Resume the game':'Start the game','Click “'+(s.time?'Resume':'Start')+'» ” above the map.','#pause',{pose:'up',dimMap:true});
 if(p.chapter==='core'){
  const b=buildStep(E,s,v,'iron');if(b)return b;
  if(!f.producedIron){
   if(f.oreReturned){if(!s.enabled.metal)return make('enable-metal','Enable smelting','Ore is in the city. Open production and resume smelting to make iron.',v.operations?'[data-plant="metal"]':'#operationsOpen');return make('smelt','Ore becomes metal','Wait for the first smelting cycle to finish. Starting iron in storage does not count as newly produced metal.','#resources .resource:nth-child(2)');}
   const haul=s.trucks.find(t=>t.job?.type==='haul'&&t.job.target==='iron');
   if(haul)return make('haul-wait',haul.leg?.kind==='back'?'First ore heading to the city':'Waiting for ore','Waiting for a full load is normal. The truck takes raw materials to the city and repeats the haul automatically.','[data-truck="'+haul.id+'"]',{site:'iron'});
   if(!s.sites.iron.enabled)return make('enable-iron','Resume extraction','Open the mine and enable extraction. Pausing extraction and ending a haul route are separate actions.',v.selected==='iron'&&v.mode==='site'?'[data-action="toggle-site"]':'[data-site="iron"]');
   return v.selected==='iron'&&v.mode==='site'?make('haul','Ore stays at the mine','Click “Assign hauling”, then choose a truck. Ore reaches the smelters only after arriving in the city.','[data-action="haul"]'):make('open-haul','Now assign hauling','Select the iron mine. Building it is only the start: transport its ore to the city.','[data-site="iron"]',{site:'iron'});
  }
  const haul=s.trucks.find(t=>t.job?.type==='haul'&&t.job.target==='iron');
  if(haul&&!f.truckHelpRead)return make('truck-help','Manage truck jobs','To manage truck jobs, click a truck icon and choose the action you need.','[data-truck="'+haul.id+'"]',{manual:true,hold:true});
  return make('core-done','First cycle complete','You built a mine, hauled ore and produced metal. Next you need copper and asphalt. You can explore further lessons in Topics.','#resources',{finish:true,hold:true});
 }
 if(p.chapter==='copper'){const b=buildStep(E,s,v,'copper');return b||make('copper-done','Now haul copper','Copper ore also travels to the city for automatic processing. Assign hauling at the mine and manage it through the truck.','[data-site="copper"]',{finish:true});}
 if(p.chapter==='asphalt'){
  if(!s.sites.gravel.active)return buildStep(E,s,v,'gravel');
  if(!s.sites.asphalt.active)return buildStep(E,s,v,'asphalt');
  if(s.city.asphalt>0)return make('asphalt-done','Asphalt is ready','Asphalt is needed for roads and the hub order. Keep some for deliveries as you expand.','#resources .resource:nth-child(4)',{finish:true});
  if(!s.enabled.asphalt)return make('enable-asphalt','Resume the plant','The plant is built but switched off. Open its card and start production.',v.selected==='asphalt'&&v.mode==='site'?'[data-action="toggle-asphalt"]':'[data-site="asphalt"]');
  if(!s.sites.gravel.enabled)return make('enable-quarry','Resume gravel extraction','Without extraction, the truck waits at an empty quarry. Open the quarry and resume production.',v.selected==='gravel'&&v.mode==='site'?'[data-action="toggle-site"]':'[data-site="gravel"]');
  const haul=s.trucks.find(t=>t.job?.type==='haul'&&t.job.target==='gravel');if(haul)return make('gravel-wait','Gravel is needed in the city','The truck waits for cargo. The asphalt plant uses city storage automatically; no separate trip to the plant is needed.','[data-truck="'+haul.id+'"]');
  return v.selected==='gravel'&&v.mode==='site'?make('gravel-haul','Deliver gravel','Click “Assign hauling”, then choose a truck.','[data-action="haul"]'):make('open-gravel','Quarry → city → asphalt','Open the quarry and assign gravel hauling to the city.','[data-site="gravel"]',{site:'gravel'});
 }
 if(p.chapter==='road'){
  if(s.roads.length>p.baseline&&v.drawing!=='road')return make('road-done','Road built','Trucks move faster on paved sections. Capacity becomes 8 only on a fully paved route to the entrance.','#roadTool',{finish:true});
  if(s.roads.length>p.baseline)return make('road-exit','Section complete','Asphalt has been spent. Click “Road” again to finish drawing and select objects.','#roadTool');
  if(s.city.asphalt<2)return make('road-no-asphalt','Produce asphalt first','Each new cell costs 2 asphalt. Build the quarry and asphalt plant, and haul gravel to the city.','[data-site="asphalt"]',{finish:true});
  if(v.drawing==='road')return make('road-draw','Hold and draw a line','Start at the city or an existing road and drag across neighboring cells. Each new cell costs 2 asphalt immediately. A short section is enough.','#map',{gesture:'road'});
  return make('road-open','Trucks can travel off-road','Roads speed up transport. Click “Road” to learn how to draw one. Remember to save asphalt for the hub.','#roadTool');
 }
 if(p.chapter==='pipe'){
  if(!s.sites.oil2.active)return buildStep(E,s,v,'oil2');
  if(!s.sites.oil2.enabled)return make('enable-well','Resume the second well','The well must be running to check oil flow.',v.selected==='oil2'&&v.mode==='site'?'[data-action="toggle-site"]':'[data-site="oil2"]');
  if(E.pipeConnected(s)){if(v.drawing==='pipe')return make('pipe-exit','Connection complete','Click “Pipeline” again to exit. Let us check the first oil delivery.','#pipeTool');if(!f.pipeFlow)return make('pipe-flow','Wait for the oil to arrive','The network is connected. Wait for oil to accumulate; the pipe carries it to the city and the refinery processes it. Resume extraction if paused.','[data-site="oil2"]',{site:'oil2'});return make('pipe-done','Oil reached the city','The continuous pipeline is working. The refinery turns oil into fuel without trucks.','#pipeTool',{finish:true});}
  if(v.drawing==='pipe')return make('pipe-draw','Connect the well to the city network','Start at the city pipeline. Hold the left mouse button and draw across neighboring cells to the second well entrance, avoiding mountains. Diagonals are allowed. Each new cell costs 1.5 iron immediately. An unfinished branch cannot deliver oil. Click “Pipeline” again to exit.','#map',{gesture:'pipe'});
  return make('pipe-open','The well needs a continuous pipe','Oil stays at the well until connected. Click “Pipeline” and make sure you have enough iron for the entire connection.','#pipeTool');
 }
 if(p.chapter==='goal'){
  if(f.delivered)return make('goal-done','Delivery counted','Your hub order progress has increased. Cargo in transit and city storage count separately. Assign each new delivery manually.','#objective',{finish:true});
  const trip=s.trucks.find(t=>t.job?.type==='goal'&&t.leg?.kind==='out');if(trip)return make('goal-wait','Cargo in transit','Wait for unloading. Only arrivals count toward the order; partial deliveries are allowed.','#objective',{site:'center'});
  return v.selected==='center'&&v.mode==='site'?make('goal-send','Send finished materials to the hub','Click “Deliver to hub”, then choose a truck. This is a single trip. Save some materials for expansion too.','[data-action="goal"]'):make('goal-open','Storage is not a delivery','Open the hub and assign a delivery. Resources must physically arrive to win.','[data-site="center"]',{site:'center'});
 }
 return make('fleet','More trucks, more options','Assembly costs 3 iron, 1 copper and 0.4 fuel and takes 12 seconds. A third truck helps, but is optional for this tutorial.','#buy',{finish:true});
}
function create(ctx,stored){
 const s=ctx.state(),p={version:2,coreDone:false,seen:{},skipped:false,...stored,seen:{...stored?.seen},chapter:null,intro:0,visible:false,baseline:0};
 let ref=s,old=snapshot(s),facts={oreReturned:s.city.ironOre>0||s.production.metal?.kind==='iron',producedIron:false,recalled:false,delivered:false},loan=null;
 function hold(){if(!loan)loan={state:ctx.state(),paused:ctx.state().paused,touched:false};ctx.state().paused=true;}
 function release(){if(loan){if(loan.state===ctx.state()&&!loan.touched&&!ctx.state().won)ctx.state().paused=loan.paused;loan=null;}}
 function persist(){ctx.save?.({version:2,coreDone:p.coreDone,seen:{...p.seen},skipped:p.skipped});}
 function start(chapter='core'){release();p.chapter=chapter;p.visible=true;if(chapter==='core')p.skipped=false;p.intro=['core','pipe','road'].includes(chapter)?0:INTRO_COUNT;p.baseline=ctx.state().roads.length;if(chapter==='goal')facts.delivered=false;if(chapter==='menu'||chapter==='core')hold();persist();}
 function tick(){const s=ctx.state();if(ref!==s){release();ref=s;old=snapshot(s);facts={oreReturned:s.city.ironOre>0,producedIron:false,recalled:false,delivered:false};p.visible=false;p.chapter=null;if(ctx.autoStart!==false&&!p.coreDone&&!p.skipped&&s.time===0)start('core');}observe(facts,old,s);old=snapshot(s);}
 function current(){tick();const s=ctx.state(),v=ctx.view();
  if(!p.visible&&!p.skipped&&p.coreDone){let chapter=null;if(v.drawing==='road'&&!p.seen.road)chapter='road';else if(v.drawing==='pipe'&&!p.seen.pipe)chapter='pipe';else if((v.selected==='oil2'||s.sites.oil2.active)&&!p.seen.pipe)chapter='pipe';else if(s.sites.asphalt.active&&!p.seen.road)chapter='road';else if(v.selected==='center'&&!p.seen.goal)chapter='goal';else if(v.selected==='copper'&&!p.seen.copper)chapter='copper';else if(['gravel','asphalt'].includes(v.selected)&&!p.seen.asphalt)chapter='asphalt';else if(s.production.vehicle&&!p.seen.fleet)chapter='fleet';if(chapter)start(chapter);}
  if(!p.visible)return null;const result=step(ctx.E,loan&&!loan.touched?{...s,paused:loan.paused}:s,v,p,facts);if(result.hold)hold();else release();return result;
 }
 function next(){const result=current();if(!result)return;if(result.manual){if(result.id==='truck-help')facts.truckHelpRead=true;else p.intro++;if(p.chapter!=='core'||p.intro===INTRO_COUNT)release();}else if(result.finish){if(p.chapter==='core'){p.coreDone=true;p.skipped=true;}else p.seen[p.chapter]=true;p.visible=false;p.chapter=null;release();}persist();ctx.refresh?.();}
 function dismiss(){p.skipped=true;p.visible=false;p.chapter=null;release();persist();ctx.refresh?.();}
 function closeChapter(){if(p.chapter&&p.chapter!=='menu')p.seen[p.chapter]=true;p.visible=false;p.chapter=null;release();persist();ctx.refresh?.();}
 if(ctx.autoStart!==false&&!p.coreDone&&!p.skipped&&s.time===0)start('core');
 return {p,start,current,next,dismiss,closeChapter,observe:tick,userPause:()=>{if(loan)loan.touched=true;},facts:()=>({...facts})};
}
function mount(ctx){
 const practice=document.body.dataset.practice==='true'&&document.body.dataset.race!=='true';let stored;
 if(!practice)try{stored=JSON.parse(localStorage.getItem(KEY));if(!stored){const legacy=JSON.parse(localStorage.getItem('logistics-tutorial-v1'));if(legacy?.active===false)stored={coreDone:true,skipped:true};}}catch{}
 const controller=create({...ctx,autoStart:!(document.body.dataset.race==='true'&&globalThis.__supplyLineEmbedded===true),save:data=>{if(!practice)try{localStorage.setItem(KEY,JSON.stringify(data));}catch{}}},stored);
 const layer=document.createElement('div');layer.id='coachLayer';layer.className='coach-layer';layer.hidden=true;
 layer.innerHTML='<div class="coach-map-dim" aria-hidden="true"></div><div class="coach-spotlight" aria-hidden="true"></div><svg class="coach-gesture-svg" aria-hidden="true"><path fill="none"/><circle class="coach-origin" r="6"/><circle class="coach-cursor" r="7"/></svg><div class="coach-figure" aria-hidden="true"></div><section class="coach-bubble" aria-label="Tutorial" aria-live="polite"><div class="coach-eyebrow"><span></span></div><h2></h2><p></p><div class="coach-actions"></div></section><div class="coach-gesture" aria-hidden="true">Hold and drag · example gesture</div>';
 document.body.append(layer);const bubble=layer.querySelector('.coach-bubble'),figure=layer.querySelector('.coach-figure'),spot=layer.querySelector('.coach-spotlight'),mapDim=layer.querySelector('.coach-map-dim'),gesture=layer.querySelector('.coach-gesture'),guide=layer.querySelector('.coach-gesture-svg');let active=null,signature='',target=null,guideKey='',guideCells=[];
 const button=(action,label,primary=false)=>'<button type="button" data-coach="'+action+'"'+(primary?' class="coach-primary"':'')+'>'+label+'</button>';
 const raceLink=()=>'<a data-coach="race" href="'+(location.protocol==='file:'?'logistics-race-bot.html':'bot-race.html')+'">Start race ↗</a>';
 function render(){active=controller.current();layer.hidden=!active;if(!active)return;
  const sig=JSON.stringify([active,controller.p.chapter]);if(signature!==sig){signature=sig;delete layer.dataset.framed;layer.dataset.step=active.id;layer.dataset.chapter=controller.p.chapter;figure.dataset.pose=active.pose||'explain';bubble.querySelector('.coach-eyebrow span').textContent=active.count||({core:'BASICS',menu:'HELP',road:'ROADS',pipe:'PIPELINE',goal:'ORDER',asphalt:'ASPHALT',copper:'COPPER',fleet:'FLEET'}[controller.p.chapter]||'HELP');bubble.querySelector('h2').textContent=active.title;bubble.querySelector('p').textContent=active.text;let actions='';
   if(active.menu){for(const [key,label] of [['core','Basics'],['road','Roads'],['pipe','Pipe'],['asphalt','Asphalt'],['goal','Delivery'],['fleet','Trucks']])actions+=button('lesson:'+key,label);actions+='<a href="'+(location.protocol==='file:'?'logistics-race-tutorial.html':'game-3d-tutorial.html')+'">Separate training game ↗</a>';if(document.body.dataset.training==='true')actions+=raceLink();actions+=button('close','Back to game');}
   else{if(active.manual||active.finish)actions+=button('next',active.finish?'Continue on your own':'Next',true);if(active.id==='core-done'&&document.body.dataset.training==='true')actions+=raceLink();actions+=button('menu','Topics');actions+=button('dismiss','Skip tutorial');}
   const focus=bubble.contains(document.activeElement)?document.activeElement?.dataset.coach:null;bubble.querySelector('.coach-actions').innerHTML=actions;if(focus)(bubble.querySelector('[data-coach="'+focus+'"]')||bubble.querySelector('button'))?.focus({preventScroll:true});if(active.id==='intro-goal')ctx.overview?.();else if(active.mapSites)ctx.focus?.();if(!matchMedia('(prefers-reduced-motion: reduce)').matches)figure.animate([{opacity:.3},{opacity:1}],{duration:160});
  }
  frame();
 }
 function frame(){if(!active)return;const dialog=[...document.querySelectorAll('dialog[open]')].find(el=>el.id!=='operations');if(dialog){layer.hidden=true;return;}layer.hidden=false;const operations=document.getElementById('operations');const parent=operations?.open?operations:document.body;if(layer.parentNode!==parent)parent.append(layer);
  let mapTarget=false;
  target=document.querySelector(active.target);if(active.site&&!ctx.view().drawing){const mapLabel=document.querySelector('#map [data-node="'+active.site+'"]');const r=mapLabel?.getBoundingClientRect();if(r&&r.width&&r.top>0&&r.bottom<innerHeight){target=mapLabel;mapTarget=true;}}
  if(!target)target=document.getElementById('details');if(!target)return;
  let tr=target.getBoundingClientRect();const mr=document.getElementById('map').getBoundingClientRect(),v={width:innerWidth,height:innerHeight};
  const resourceRect=document.getElementById('resources').getBoundingClientRect(),safeTop=Math.max(mr.y,resourceRect.bottom>0&&resourceRect.bottom<innerHeight?resourceRect.bottom+12:mr.y);
  if(mapTarget){const ids=active.mapSites||[active.site],key=active.id+':'+innerWidth+':'+innerHeight;if(layer.dataset.framed!==key){ctx.makeRoom?.(ids,safeTop+(innerWidth<640?108:174)+22);layer.dataset.framed=key;}const boxes=ids.map(id=>ctx.projectSite?.(id)).filter(Boolean);if(boxes.length){const xs=boxes.flatMap(r=>[r.x,r.x+r.width]),ys=boxes.flatMap(r=>[r.y,r.y+r.height]);tr={x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};tr.top=tr.y;tr.bottom=tr.y+tr.height;}}
  const key=active.gesture+':'+ctx.state().roads.length+':'+ctx.state().pipeCells.length;if(key!==guideKey){guideKey=key;guideCells=active.gesture?sampleCells(ctx.E,ctx.state(),active.gesture):[];}
  const points=guideCells.map(p=>ctx.projectCell?.(p,active.gesture)).filter(Boolean),show=!!active.gesture&&points.length>1;
  if(show){const xs=points.map(p=>p.x),ys=points.map(p=>p.y);tr={x:Math.min(...xs)-18,y:Math.min(...ys)-18,width:Math.max(...xs)-Math.min(...xs)+36,height:Math.max(...ys)-Math.min(...ys)+36};tr.top=tr.y;tr.bottom=tr.y+tr.height;}
  const rect={x:tr.x,y:tr.y,width:tr.width,height:tr.height};
  const pose=mapTarget?'folded':active.pose||(target.closest('#resources,.map-top')?'up':undefined);
  bubble.style.width=Math.min(innerWidth<640?276:300,innerWidth-24)+'px';const layout=placement(rect,{x:mr.x,y:safeTop,width:mr.width,height:mr.bottom-safeTop},v,pose,bubble.getBoundingClientRect().height);figure.dataset.pose=pose||layout.pose;layer.dataset.targetKind=mapTarget?'map':'ui';
  for(const [el,r] of [[figure,layout.character],[bubble,layout.bubble]])Object.assign(el.style,{left:r.x+'px',top:r.y+'px',width:r.width+'px'});figure.style.height=layout.character.height+'px';
  Object.assign(spot.style,{left:(tr.x-6)+'px',top:(tr.y-6)+'px',width:(tr.width+12)+'px',height:(tr.height+12)+'px'});spot.classList.toggle('dim',!!active.manual);spot.hidden=tr.bottom<0||tr.top>innerHeight;
  mapDim.hidden=!active.dimMap;Object.assign(mapDim.style,{left:mr.x+'px',top:mr.y+'px',width:mr.width+'px',height:mr.height+'px'});
  gesture.hidden=!show;guide.style.display=show?'block':'none';
  if(show){guide.setAttribute('width',innerWidth);guide.setAttribute('height',innerHeight);guide.querySelector('path').setAttribute('d',points.map((p,i)=>(i?'L':'M')+p.x+','+p.y).join(' '));const origin=guide.querySelector('.coach-origin');origin.setAttribute('cx',points[0].x);origin.setAttribute('cy',points[0].y);const u=matchMedia('(prefers-reduced-motion: reduce)').matches?.65:(performance.now()%2800)/2800,pos=u*(points.length-1),i=Math.min(points.length-2,Math.floor(pos)),t=pos-i,cursor=guide.querySelector('.coach-cursor');cursor.setAttribute('cx',points[i].x+(points[i+1].x-points[i].x)*t);cursor.setAttribute('cy',points[i].y+(points[i+1].y-points[i].y)*t);gesture.style.left=clamp(points[0].x,12,innerWidth-220)+'px';gesture.style.top=clamp(points[0].y-35,12,innerHeight-50)+'px';}
 }
 layer.addEventListener('click',e=>{const action=e.target.closest('[data-coach]')?.dataset.coach;if(!action)return;if(action==='next')controller.next();else if(action==='dismiss')controller.dismiss();else if(action==='close')controller.closeChapter();else if(action==='menu')controller.start('menu');else if(action==='race'){if(active.id==='core-done')controller.next();try{const old=JSON.parse(localStorage.getItem(KEY))||{};localStorage.setItem(KEY,JSON.stringify({version:2,coreDone:!!(old.coreDone||controller.p.coreDone),seen:{...old.seen,...controller.p.seen},skipped:old.skipped||!controller.p.coreDone}));}catch{}}else if(action.startsWith('lesson:'))controller.start(action.slice(7));else if(action==='reveal'){target?.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});if(active.site)ctx.focus?.();}render();ctx.refresh?.();});
 document.getElementById('tutorialReplay').onclick=()=>{controller.start('menu');render();ctx.refresh?.();};document.getElementById('pause').addEventListener('click',controller.userPause);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&controller.p.visible&&!document.querySelector('dialog[open]')){controller.closeChapter();render();ctx.refresh?.();}});
 render();return {render,frame,observe:controller.observe,controller};
}
const api={KEY,INTRO_COUNT,placement,sampleCells,snapshot,observe,buildStep,pendingStep,step,create,mount};if(typeof module==='object'&&module.exports)module.exports=api;else root.LogisticsCoach=api;
})(typeof globalThis!=='undefined'?globalThis:this);
