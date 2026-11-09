'use strict';
// This adapter is loaded only on bot-race.html, after the normal game app.
// The normal save is never read or written: the page uses data-practice.
const RivalE=typeof globalRaceWorldEngines==='undefined'?E:globalRaceWorldEngines.rival;
const Bot=LogisticsBot.withEngine?LogisticsBot.withEngine(RivalE):LogisticsBot,baseTick=E.tick,baseRender=render;
let racePlayer=null,rival=null,raceResult=null,territory='both',rivalSelection=null;
const operationsDialog=document.getElementById?.('operations')||null;
// Reuse the player's existing journal so the normal render continues updating it.
const playerJournal=document.getElementById?.('journal')||null;
let rivalJournal=null;
if(operationsDialog&&playerJournal){
 const journalGrid=document.createElement('div');journalGrid.className='race-journal';
 const playerColumn=document.createElement('section');playerColumn.innerHTML='<h4>Вы</h4>';
 const rivalColumn=document.createElement('section');rivalColumn.innerHTML='<h4>Соперник</h4><div id="rivalJournal"></div>';
 playerJournal.before(journalGrid);journalGrid.append(playerColumn,rivalColumn);playerColumn.append(playerJournal);
 rivalJournal=document.getElementById('rivalJournal');
}
// The race header is part of the existing top row, preserving the map grid.
let raceOverview=null,raceComparison=null,raceObject=null;
const raceHeader=document.querySelector('.map-top');
if(raceHeader?.append){
 raceOverview=document.createElement('section');raceOverview.id='raceOverview';raceOverview.className='race-overview';raceOverview.setAttribute('aria-label','Сравнение территорий и прогресса');
 raceOverview.innerHTML='<div id="raceComparison" class="race-comparison"></div><div id="raceObject" class="race-object" hidden></div>';
 raceHeader.append(raceOverview);
 raceComparison=document.getElementById('raceComparison');raceObject=document.getElementById('raceObject');
}
function raceMap(){return typeof map3d==='undefined'?null:map3d;}
function focusRaceTerritory(value){
 if(!['player','rival','both'].includes(value))return;territory=value;
 raceMap()?.focusTerritory?.(value);
 if(raceOverview?.querySelectorAll)for(const button of raceOverview.querySelectorAll('[data-territory]'))button.setAttribute('aria-pressed',String(button.dataset.territory===value));
}
function deliveryProgress(s){const total=Object.values(s.goal).reduce((n,v)=>n+v,0),delivered=Object.entries(s.goal).reduce((n,[k,goal])=>n+Math.min(goal,Math.max(0,s.delivered[k]||0)),0);return total?delivered/total*100:0;}
function raceOverviewPanel(){
 if(!raceComparison)return;
 const row=(s,name)=>{const progress=deliveryProgress(s);
  return '<div class="race-contender"><strong>'+name+' <span>'+fmt(progress)+'%</span></strong><div class="race-meter" role="progressbar" aria-label="'+name+': доставлено заказа" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+progress.toFixed(1)+'"><span style="width:'+progress+'%"></span></div><small>Доставлено '+Object.entries(s.goal).map(([k,n])=>fmt(s.delivered[k])+'/'+n+' '+E.names[k].toLowerCase()).join(' · ')+'</small></div>';};
 const html=row(state,'Вы')+row(rival.state,'Соперник');if(raceComparison._raceHTML!==html){raceComparison.innerHTML=html;raceComparison._raceHTML=html;}
 if(raceObject){raceObject.hidden=!rivalSelection;if(rivalSelection){const s=rival.state,id=rivalSelection,site=s.sites[id];raceObject.textContent='Соперник · '+E.label(id)+' · '+(site?E.siteStatus(s,id):id==='center'?'Доставлено '+fmt(deliveryProgress(s))+'% заказа':id==='city'?'Общий склад и производство':'Добыча нефти')+(site?.active?' · На складе: '+fmt(site.stock):site?' · Материалы: '+Object.entries(E.costs[id]).map(([k,n])=>E.names[k]+' '+fmt(site.received[k])+'/'+n+(site.incoming[k]?' ('+fmt(site.incoming[k])+' в пути)':'')).join(', '):'')+' · Только просмотр';}}
}
const rivalStyle=document.createElement('style');
rivalStyle.textContent=`
body.three-game[data-race] .map-top{flex-wrap:wrap;gap:5px 12px}
body.three-game .race-overview{flex:1 0 100%;min-width:0;color:#d2d9d2}
body.three-game .race-comparison{display:grid;grid-template-columns:1fr 1fr;gap:8px 16px}
body.three-game .race-contender{min-width:0}
body.three-game .race-contender strong{display:flex;justify-content:space-between;font:600 12px/1.3 Arial,sans-serif}
body.three-game .race-contender small{display:block;font:10px/1.4 Arial,sans-serif;overflow-wrap:anywhere}
body.three-game .race-meter{height:4px;background:#354c58;border-radius:3px;overflow:hidden;margin:3px 0}
body.three-game .race-meter span{display:block;height:100%;background:#8eaa8b}
body.three-game .race-contender:last-child .race-meter span{background:#dd9d5e}
body.three-game .race-object{padding:6px 8px;margin-top:5px;border-left:3px solid #a66f3d;background:#263e48;font:11px/1.4 Arial,sans-serif;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
body.three-game .race-object[hidden]{display:none}
body.three-game #operations .race-journal{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0}
body.three-game #operations .race-journal>section{min-width:0;margin:0;padding:0 16px 0 0}
body.three-game #operations .race-journal>section+section{border-left:1px solid #52636c;padding:0 0 0 16px}
body.three-game .race-journal h4{margin:0 0 10px;font-size:13px}
body.three-game .race-journal #journal,body.three-game #rivalJournal{max-height:220px;overflow:auto}
body.three-game .race-journal .logline{gap:8px;overflow-wrap:anywhere}
body.three-game .race-journal time{flex-shrink:0}
@media(max-width:520px){body.three-game .race-comparison{gap:8px}body.three-game .race-contender small{font-size:9px}body.three-game .race-journal>section{padding-right:8px}body.three-game #operations .race-journal>section+section{padding-left:8px}body.three-game .race-journal .logline{flex-direction:column;gap:2px;font-size:11px}}
`;
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

 if(rivalJournal){
  const escape=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const journalHTML=s.log.slice(0,12).map(e=>'<div class="logline"><time>'+time(e.t)+'</time><span>'+escape(e.text)+'</span></div>').join('');
  if(rivalJournal._raceHTML!==journalHTML){rivalJournal.innerHTML=journalHTML;rivalJournal._raceHTML=journalHTML;}
 }
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
// Keep the existing whole-map control available below the map.
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


