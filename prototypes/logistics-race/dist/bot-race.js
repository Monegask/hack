'use strict';
// This adapter is loaded only on bot-race.html, after the normal game app.
// The normal save is never read or written: the page uses data-practice.
const RivalE=typeof globalRaceWorldEngines==='undefined'?E:globalRaceWorldEngines.rival;
const Bot=LogisticsBot.withEngine?LogisticsBot.withEngine(RivalE):LogisticsBot,baseTick=E.tick,baseRender=render;
let racePlayer=null,rival=null,raceResult=null,territory='both',rivalSelection=null;
const rivalPanel=document.createElement('section');
rivalPanel.className='objective';rivalPanel.id='rival';
const operationsDialog=document.getElementById?.('operations')||null;
if(operationsDialog){
 const firstSection=operationsDialog.querySelector('section');
 if(firstSection)firstSection.before(rivalPanel);else operationsDialog.append(rivalPanel);

}else document.querySelector('aside').prepend(rivalPanel);
// The race header is part of the existing top row, preserving the map grid.
let raceOverview=null,raceComparison=null,raceLead=null,raceObject=null;
const raceHeader=document.querySelector('.map-top');
if(raceHeader?.append){
 raceOverview=document.createElement('section');raceOverview.id='raceOverview';raceOverview.className='race-overview';raceOverview.setAttribute('aria-label','Сравнение территорий и прогресса');
 raceOverview.innerHTML='<nav class="race-territories" aria-label="Показать территорию"><button type="button" data-territory="player" aria-pressed="false">Моя территория</button><button type="button" data-territory="rival" aria-pressed="false">Соперник</button><button type="button" data-territory="both" aria-pressed="true">Обе территории</button><button type="button" data-race-details>Подробности соперника</button></nav><div id="raceComparison" class="race-comparison"></div><p id="raceLead" class="race-lead" role="status"></p><div id="raceObject" class="race-object" hidden></div>';
 raceHeader.append(raceOverview);
 raceComparison=document.getElementById('raceComparison');raceLead=document.getElementById('raceLead');raceObject=document.getElementById('raceObject');
 raceOverview.onclick=e=>{const button=e.target.closest('[data-territory]');if(button){focusRaceTerritory(button.dataset.territory);return;}if(e.target.closest('[data-race-details]')&&operationsDialog){if(!operationsDialog.open)operationsDialog.showModal();rivalPanel.scrollIntoView({block:'start'});}};
}
function raceMap(){return typeof map3d==='undefined'?null:map3d;}
function focusRaceTerritory(value){
 if(!['player','rival','both'].includes(value))return;territory=value;
 raceMap()?.focusTerritory?.(value);
 if(raceOverview?.querySelectorAll)for(const button of raceOverview.querySelectorAll('[data-territory]'))button.setAttribute('aria-pressed',String(button.dataset.territory===value));
}
function deliveryProgress(s){const total=Object.values(s.goal).reduce((n,v)=>n+v,0),delivered=Object.entries(s.goal).reduce((n,[k,goal])=>n+Math.min(goal,Math.max(0,s.delivered[k]||0)),0);return total?delivered/total*100:0;}
function playerStage(s){
 if(s.won)return 'Заказ доставлен';
 const building=Object.values(s.sites).find(site=>site.construction);if(building)return 'Строит: '+E.label(building.id);
 const crew=s.trucks.find(t=>t.job?.type==='crew');if(crew)return 'Везёт строителей: '+E.label(crew.job.target);
 const materials=s.trucks.find(t=>t.job?.type==='materials'&&t.leg?.kind==='out');if(materials)return 'Доставляет материалы: '+E.label(materials.job.target);
 if(Object.values(s.delivered).some(n=>n>0)||s.trucks.some(t=>t.job?.type==='goal'))return 'Снабжает хаб';
 if(s.sites.asphalt.active)return 'Производит асфальт и готовит заказ';
 if(s.sites.gravel.active)return 'Развивает дорожное производство';
 if(s.sites.copper.active)return 'Обеспечивает металлы';
 if(s.sites.iron.active)return 'Развивает добычу';
 return 'Запускает первые предприятия';
}
function raceOverviewPanel(){
 if(!raceComparison)return;
 const row=(s,name,stage)=>{const progress=deliveryProgress(s),built=Object.values(s.sites).filter(site=>site.active).length,total=Object.keys(s.sites).length;
  return '<div class="race-contender"><strong>'+name+' <span>'+fmt(progress)+'%</span></strong><div class="race-meter" role="progressbar" aria-label="'+name+': доставлено заказа" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+progress.toFixed(1)+'"><span style="width:'+progress+'%"></span></div><small>Доставлено '+Object.entries(s.goal).map(([k,n])=>fmt(s.delivered[k])+'/'+n+' '+E.names[k].toLowerCase()).join(' · ')+'</small><small>Построено '+built+'/'+total+' · '+stage+'</small></div>';};
 const html=row(state,'Вы',playerStage(state))+row(rival.state,'Соперник',Bot.status(rival));if(raceComparison._raceHTML!==html){raceComparison.innerHTML=html;raceComparison._raceHTML=html;}
 const lead=deliveryProgress(state)-deliveryProgress(rival.state);
 const opening=deliveryProgress(state)===0&&deliveryProgress(rival.state)===0;
 raceLead.textContent=raceResult||(opening?'До первой доставки · построено у вас '+Object.values(state.sites).filter(site=>site.active).length+'/'+Object.keys(state.sites).length+', у соперника '+Object.values(rival.state.sites).filter(site=>site.active).length+'/'+Object.keys(rival.state.sites).length:Math.abs(lead)<.05?'Доставлено поровну':lead>0?'Вы опережаете на '+fmt(lead)+' п.п. по доставке':'Вы отстаёте на '+fmt(-lead)+' п.п. по доставке');
 if(raceObject){raceObject.hidden=!rivalSelection;if(rivalSelection){const s=rival.state,id=rivalSelection,site=s.sites[id];raceObject.textContent='Соперник · '+E.label(id)+' · '+(site?E.siteStatus(s,id):id==='center'?'Доставлено '+fmt(deliveryProgress(s))+'% заказа':id==='city'?'Общий склад и производство':'Добыча нефти')+(site?.active?' · На складе: '+fmt(site.stock):site?' · Материалы: '+Object.entries(E.costs[id]).map(([k,n])=>E.names[k]+' '+fmt(site.received[k])+'/'+n+(site.incoming[k]?' ('+fmt(site.incoming[k])+' в пути)':'')).join(', '):'')+' · Только просмотр';}}
}
const rivalStyle=document.createElement('style');
rivalStyle.textContent='#rival{border:2px solid #b78341}#rival p{margin:10px 0}#rival summary{cursor:pointer}#rival ul{padding-left:18px;font-size:12px}#rival h2{margin-bottom:10px}body.three-game .race-status{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:3px 7px;width:100%;margin-top:7px;padding:5px 7px;border:1px solid #c7bcaa;border-radius:6px;background:#eee8dc;color:#5c5142;font:500 10px/1.3 "Segoe UI",Arial,sans-serif;text-align:left}body.three-game .race-status span:last-child{font-variant-numeric:tabular-nums}body.three-game #operations #rival{padding:14px;border-radius:10px;margin-bottom:18px;scroll-margin-top:12px}';
rivalStyle.textContent+='body.three-game[data-race] .map-top{flex-wrap:wrap;gap:8px 12px}body.three-game .race-overview{flex:1 0 100%;min-width:0;color:#393e37}body.three-game .race-territories{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:7px}body.three-game .race-territories button{padding:5px 9px;font:500 11px/1.25 Arial,sans-serif;border:1px solid #bdb4a2;border-radius:6px;background:#f5eedf;color:#393e37}body.three-game .race-territories button[aria-pressed="true"]{background:#343c37;color:#fff8eb;border-color:#343c37}body.three-game .race-territories [data-race-details]{margin-left:auto}body.three-game .race-comparison{display:grid;grid-template-columns:1fr 1fr;gap:8px 16px}body.three-game .race-contender{min-width:0}body.three-game .race-contender strong{display:flex;justify-content:space-between;font:600 12px/1.3 Arial,sans-serif}body.three-game .race-contender small{display:block;font:10px/1.4 Arial,sans-serif;overflow-wrap:anywhere}body.three-game .race-meter{height:4px;background:#d4cbbb;border-radius:3px;overflow:hidden;margin:4px 0}body.three-game .race-meter span{display:block;height:100%;background:#617360}body.three-game .race-contender:last-child .race-meter span{background:#a66f3d}body.three-game .race-lead{margin:5px 0 0;font:600 11px/1.3 Arial,sans-serif}body.three-game .race-object{padding:6px 8px;margin-top:5px;border-left:3px solid #a66f3d;background:#eee8dc;font:11px/1.4 Arial,sans-serif;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}body.three-game .race-object[hidden]{display:none}@media(max-width:520px){body.three-game .race-comparison{gap:8px}body.three-game .race-contender small{font-size:9px}body.three-game .race-territories [data-race-details]{margin-left:0}}';
document.head.appendChild(rivalStyle);
function raceReset(){
 racePlayer=state;rival=Bot.create((Date.now()^Math.floor(Math.random()*4294967296))>>>0);raceResult=null;rivalSelection=null;
 if(typeof globalRaceWorldEngines!=='undefined'){for(const p of [E.positions.city,RivalE.positions.city])if(!state.roads.includes(p.join(',')))state.roads.push(p.join(','));}
 rival.state.roads=state.roads;
 const view=raceMap();if(view){view.onRivalSelect=id=>{if(Object.hasOwn(E.positions,id)){rivalSelection=id;raceOverviewPanel();}};view.setRivalState?.(rival.state,0,RivalE);}focusRaceTerritory('both');
 $('win').querySelector('h2').textContent='Хаб снова работает.';
}
function racePanel(){
 if(racePlayer!==state)raceReset();
 const s=rival.state;s.paused=state.paused||!!raceResult;
 raceMap()?.setRivalState?.(s,0,RivalE);raceOverviewPanel();

 const expanded=!!rivalPanel.querySelector('details')?.open;
 rivalPanel.innerHTML='<div class="eyebrow">СОПЕРНИК · СРЕДНЯЯ СЛОЖНОСТЬ</div><h2>'+ (raceResult||Bot.status(rival))+'</h2>'+Object.entries(s.goal).map(([k,n])=>'<div class="goal-row"><span>'+E.names[k]+'</span><b>'+s.delivered[k]+' / '+n+(s.outgoing[k]?' · '+s.outgoing[k]+' в пути':'')+'</b><div class="bar"><span style="width:'+s.delivered[k]/n*100+'%"></span></div></div>').join('')+
 '<p>'+rival.last+'</p><p>Машин: '+s.trucks.length+' · топливо: '+fmt(s.fuel)+' · время: '+time(s.time)+'</p><details'+(expanded?' open':'')+'><summary>Система соперника</summary><ul>'+Object.keys(E.costs).map(id=>'<li>'+E.label(id)+': '+E.siteStatus(s,id)+'</li>').join('')+s.trucks.map(t=>'<li>Машина '+t.id+': '+t.status+(t.job?' · '+E.label(t.job.target):'')+'</li>').join('')+'</ul><p>Склад: '+s.city.iron+' Fe · '+s.city.copper+' Cu · '+s.city.asphalt+' асфальта</p></details><p class="subtle">Две территории на общей местности, один общий хаб и отдельный заказ у каждого. Дороги общие, склады и предприятия раздельные. Пауза и скорость действуют на обоих. Гонка не сохраняется; одиночное сохранение не меняется.</p>';
 if(raceResult){$('pause').disabled=true;$('pause').textContent='Гонка завершена';}
}
render=function(){baseRender();racePanel();};
E.tick=function(s,dt){
 if(s!==state){baseTick(s,dt);return;}
 if(racePlayer!==s)raceReset();
 if(raceResult||s.paused)return;
 baseTick(s,dt);rival.state.paused=false;Bot.tick(rival,dt);
 // Both states complete the same 0.1-second step before checking the result.
 if(s.won||rival.state.won){
  raceResult=s.won&&rival.state.won?'Ничья':s.won?'Вы победили!':'Бот победил';
  s.paused=true;rival.state.paused=true;winShown=true;
  $('win').querySelector('h2').textContent=raceResult;
  $('winText').textContent='Время гонки: '+time(s.time)+'. Ваш заказ: '+Object.values(s.delivered).join(' / ')+'. Заказ бота: '+Object.values(rival.state.delivered).join(' / ')+'.';
  $('win').showModal();render();
 }
};
// The existing whole-map control also returns to the same overview as the tabs.
$('mapView').textContent='Обзор территорий';$('mapView').onclick=()=>focusRaceTerritory('both');
$('restart').querySelector('p').textContent='Начнётся новая гонка с ботом. Одиночное сохранение останется доступным.';
// Both engines and the scene own one immutable match layout. Reload the isolated
// race to draw a fresh seed before either simulation or scene is constructed.
if(typeof globalRaceWorldEngines!=='undefined'){
 $('confirmReset').onclick=()=>globalThis.location.reload();
 $('restart').querySelector('p').textContent='Начнётся новая гонка с новой раскладкой месторождений. Одиночное сохранение останется доступным.';
}
document.querySelector('.prototype-note').textContent='Гонка с ботом: одинаковые начальные ресурсы и экономика, две территории на общей местности и один общий хаб. Средняя сложность пока пробная; доля побед требует проверки с игроками.';
racePanel();
