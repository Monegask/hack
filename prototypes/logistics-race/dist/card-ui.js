(function(root){
'use strict';
// Presentation only. Eligibility and cargo are calculated by the real engine on a copy.
function inspect(E,state,truckId,type,target){
 const copy=JSON.parse(JSON.stringify(state));copy.paused=false;
 const ok=E.start(copy,truckId,type,target),truck=copy.trucks.find(t=>t.id===truckId);
 return {ok,reason:ok?'':copy.notice||'Действие недоступно',cargo:ok?truck.cargo:{},route:E.routeInfo(state,target)};
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
function create(ctx){
 const {E,$,fmt}=ctx;let mode='site',pending=null,notice='',reference=ctx.state();
 const tutorialKey='logistics-tutorial-v1';let tutorialActive=ctx.state().time===0,tutorialDelivered=false,tutorialWatch=null,roadHintDone=false;
 try{if(typeof localStorage!=='undefined'&&!document.body.dataset?.practice){const saved=JSON.parse(localStorage.getItem(tutorialKey));if(saved){tutorialActive=saved.active;tutorialDelivered=saved.delivered;roadHintDone=saved.roadHintDone;tutorialWatch=saved.watch||null;}}}catch{}
 function saveTutorial(){if(typeof LogisticsCoach!=='undefined')return;try{if(typeof localStorage!=='undefined'&&!document.body.dataset?.practice)localStorage.setItem(tutorialKey,JSON.stringify({active:tutorialActive,delivered:tutorialDelivered,roadHintDone,watch:tutorialWatch}));}catch{}}
 const gallery=['iron','copper','gravel','asphalt','oil2','center'];
 const short={iron:'Железо',copper:'Медь',gravel:'Карьер',asphalt:'Асфальт',oil2:'Скважина',center:'Хаб'};
 const labels={materials:'Привезти материалы',crew:'Отправить строителей',haul:'Организовать вывоз',goal:'Доставить в хаб'};
 const markup=(id,value)=>{const el=$(id);if(el._cardHTML!==value){el.innerHTML=value;el._cardHTML=value;}};
 const refresh=()=>ctx.refresh();
 function selectionAllowed(){if(ctx.canSelectSite&&!ctx.canSelectSite()){notice='Сначала завершите рисование дороги или нефтепровода.';refresh();return false;}return true;}
 function chooseSite(id){if(!selectionAllowed())return;if(id==='city'){notice='Город работает автоматически. НПЗ и металлургия доступны в «Производство».';refresh();return;}pending=null;mode='site';notice='';ctx.selectSite(id);refresh();}
 function animate(source){if(!source||matchMedia('(prefers-reduced-motion: reduce)').matches)return;const to=$('details').querySelector('.selected-disc');if(!to)return;const a=source.getBoundingClientRect?source.getBoundingClientRect():source,b=to.getBoundingClientRect();to.animate([{transform:'translate('+(a.x+a.width/2-b.x-b.width/2)+'px,'+(a.y+a.height/2-b.y-b.height/2)+'px) scale(.7)'},{transform:'none'}],{duration:320,easing:'cubic-bezier(.2,.8,.2,1)'});}
 function dispatch(){if(!pending?.truck)return;const p={...pending},s=ctx.state();pending.truck=null;ctx.perform(()=>{const ok=E.start(s,p.truck,p.type,p.target);if(ok){
  const site=s.sites[p.target],more=ctx.batchMaterials&&p.type==='materials'&&Object.entries(E.costs[p.target]||{}).some(([k,n])=>site.received[k]+site.incoming[k]<n);
  pending=more?{type:p.type,target:p.target,truck:null,sent:(p.sent||0)+1}:null;mode='site';ctx.selectSite(p.target);ctx.selectTruck(p.truck);notice='Машина '+p.truck+' отправлена: '+labels[p.type].toLowerCase()+'.'+(more?' Можно выбрать следующую свободную машину для оставшегося груза.':'');
 }else notice=s.notice;return ok;});}
 function chooseTruck(id){if(!selectionAllowed())return;const s=ctx.state(),t=s.trucks.find(t=>t.id===id);if(!t)return;
  const source=$('fleet').querySelector('[data-truck="'+id+'"] .icon-disc')?.getBoundingClientRect();
  if(pending){const check=inspect(E,s,id,pending.type,pending.target);if(!check.ok){notice=check.reason;refresh();return;}pending.truck=id;ctx.selectTruck(id);if(!s.paused){dispatch();return;}notice='Игра на паузе. Нажмите «Продолжить и отправить».';}else{mode='truck';notice='';}
  ctx.selectTruck(id);refresh();animate(source);
 }
 function begin(type){const s=ctx.state(),id=ctx.selected();if(type==='haul'&&s.trucks.some(t=>t.job?.type==='haul'&&t.job.target===id&&!t.stop)){notice='Вывоз уже назначен. Управляйте маршрутом через транспорт.';refresh();return;}if(type==='crew'&&!Object.entries(E.costs[id]||{}).every(([k,n])=>(s.sites[id]?.received[k]||0)+(s.sites[id]?.incoming[k]||0)>=n)){notice='Сначала отправьте все строительные материалы.';refresh();return;}pending={type,target:ctx.selected(),truck:null};notice='Выберите подсвеченную машину в блоке транспорта или на карте.';refresh();}
 function render(){const s=ctx.state();if(reference!==s){reference=s;pending=null;mode='site';notice='';tutorialDelivered=false;tutorialWatch=null;roadHintDone=false;tutorialActive=s.time===0;saveTutorial();}if(s.won)pending=null;if(pending?.truck&&!s.paused){dispatch();return;}
  markup('objective',Object.entries(s.goal).map(([k,n])=>'<div class="goal-row"><span>'+E.names[k]+'</span><b>'+fmt(s.delivered[k])+' / '+n+'</b><small class="goal-transit">В пути: '+fmt(s.outgoing[k])+'</small><div class="bar"><span style="width:'+Math.min(100,s.delivered[k]/n*100)+'%"></span></div></div>').join(''));
  markup('resources',[['fuel','Топливо',s.fuel],['iron','Железо',s.city.iron],['copper','Медь',s.city.copper],['asphalt','Асфальт',s.city.asphalt],['gravel','Щебень',s.city.gravel]].map(([k,n,v])=>'<div class="resource"><span class="resource-icon">'+(['iron','copper'].includes(k)?'<span class="ingot"><span></span><span></span><span></span></span>':icon(k==='asphalt'?'route':k))+'</span><span><small>'+n+'</small><b>'+fmt(v)+'</b></span></div>').join(''));
  markup('siteGallery',gallery.map(id=>'<button class="gallery-button '+(mode==='site'&&ctx.selected()===id?'selected':'')+'" data-site="'+id+'" aria-pressed="'+(mode==='site'&&ctx.selected()===id)+'" aria-label="'+E.label(id)+'"><span class="icon-disc">'+siteIcon(s,id)+'</span><span class="gallery-label">'+short[id]+'</span><span class="gallery-status">'+(s.sites[id]?E.siteStatus(s,id):'Заказ')+'</span></button>').join(''));
  const checks=pending?Object.fromEntries(s.trucks.map(t=>[t.id,inspect(E,s,t.id,pending.type,pending.target)])):{};
  markup('fleet',s.trucks.map(t=>{const eligible=!!pending&&checks[t.id].ok,active=(pending?.truck===t.id)||(!pending&&mode==='truck'&&ctx.truck()===t.id);
   return '<button class="truck-button '+(active?'selected ':'')+(pending?(eligible?'eligible':'unavailable'):'')+'" data-truck="'+t.id+'" data-available="'+(!t.job&&!t.leg&&!s.won)+'" aria-pressed="'+active+'" aria-label="Машина '+t.id+': '+t.status+'"><span class="icon-disc">'+icon('truck')+'<span class="truck-number">'+String(t.id).padStart(2,'0')+'</span></span><span class="truck-status">'+(eligible?'Выбрать':t.stop?'Последний рейс':t.status)+'</span><span class="truck-target">'+(t.job?E.label(t.job.target):'В городе')+'</span></button>';
  }).join(''));
  $('fleetCount').textContent=s.trucks.filter(t=>!t.job&&!t.leg).length+' свободно / '+s.trucks.length;
  $('buy').disabled=!!s.production.vehicle||s.won;$('buy').textContent=s.production.vehicle?'Сборка · '+Math.ceil(s.production.vehicle.left)+' с':'＋ Собрать машину';
  if(document.activeElement?.id!=='metalMode')markup('production',[['oil','Стартовая скважина','Нефть: '+s.city.oil],['refinery','НПЗ','Нефть → топливо'],['metal','Металлургия','Железная руда: '+s.city.ironOre+' · медная: '+s.city.copperOre],['asphalt','Асфальтовый завод','Щебень: '+s.city.gravel]].map(([id,n,sub])=>'<div class="plant"><div>'+n+'<small>'+sub+' · '+(s.production[id]?'работает':s.enabled[id]?'ожидает':'пауза')+'</small></div>'+(id==='metal'?'<select id="metalMode" aria-label="Приоритет металлургии">'+[['auto','Автовыбор'],['iron','Железо'],['copper','Медь']].map(([v,n])=>'<option value="'+v+'" '+(s.metalMode===v?'selected':'')+'>'+n+'</option>').join('')+'</select>':'')+'<button data-plant="'+id+'" '+(id==='asphalt'&&!s.sites.asphalt.active?'disabled':'')+'>'+(s.enabled[id]?'Пауза':'Пуск')+'</button></div>').join(''));
  const t=s.trucks.find(t=>t.id===ctx.truck()),focus=document.activeElement?.closest?.('[data-action]')?.dataset.action;
  let title,sub='',acts='',disc=ctx.selected(),path='',message=notice;
  function button(key,name,hint,disabled=false,primary=false){acts+='<button class="action-card '+(primary?'primary':'')+'" data-action="'+key+'" '+(disabled?'disabled':'')+'><strong>'+name+'</strong><small>'+hint+'</small></button>';}
  if(pending){title=E.label(pending.target);path=labels[pending.type]+' → Выбор машины';
   const valid=Object.values(checks).find(c=>c.ok),r=E.routeInfo(s,pending.target);
   sub='Выберите подсвеченную машину — она сразу отправится.';
   acts='<div class="assignment-summary">'+(pending.type==='crew'?'Команда строителей':pending.type==='haul'?'Регулярный вывоз · до '+r.capacity+' за рейс':valid?E.cargoText(valid.cargo):'Нет подходящей машины')+'<br>На весь рейс: <b>'+fmt(r.fuel)+' топлива</b><br>'+fmt(r.seconds)+' с в одну сторону</div>';
   if(pending.truck&&s.paused)button('resume','Продолжить и отправить','Машина '+pending.truck+' · без дополнительного подтверждения',false,true);
   else if(s.paused)button('resume','Продолжить игру','Затем выберите машину',false,true);
   if(!valid)message=Object.values(checks).find(c=>c.reason&&!/занята/.test(c.reason))?.reason||'Все машины заняты. Дождитесь возвращения или отзовите регулярный маршрут.';
  }else if(mode==='truck'&&t){title='Машина '+t.id;disc='truck';sub=t.status+(t.job?' · '+E.label(t.job.target):' · в городе');
   acts='<div class="assignment-summary">'+(Object.keys(t.cargo).length?E.cargoText(t.cargo):t.job?.type==='crew'?'Строители':'Без груза')+'</div>';
   if(t.job?.type==='haul')button('stop',t.stop?'Маршрут завершается':'Завершить маршрут','Забрать доступный груз и вернуться',t.stop||s.won,true);
   if(t.job)button('open-target','Открыть предприятие',E.label(t.job.target));else acts+='<p class="subtle">Свободна. Новое задание выбирается в карточке предприятия.</p>';
  }else{const id=ctx.selected(),site=s.sites[id];title=E.label(id);sub=site?E.siteStatus(s,id):id==='oil'?'Автоматическая подача нефти в город':'Доставка заказа';
   if(site&&!site.active){const delivered=Object.entries(E.costs[id]).every(([k,n])=>site.received[k]>=n),covered=Object.entries(E.costs[id]).every(([k,n])=>site.received[k]+site.incoming[k]>=n);
    acts='<div class="assignment-summary">'+Object.entries(E.costs[id]).map(([k,n])=>E.names[k]+': '+site.received[k]+'/'+n+(site.incoming[k]?' · '+site.incoming[k]+' в пути':'')).join('<br>')+'</div>';
    if(!covered&&!site.construction)button('materials','Привезти материалы','Доставить недостающее',s.won,true);
    const crewOnWay=s.trucks.some(t=>t.job?.type==='crew'&&t.job.target===id);
    if(covered&&!site.construction&&!crewOnWay)button('crew','Отправить строителей',delivered?'Материалы на месте · выбрать машину':'Материалы в пути · строители могут выехать',s.builder!==null||s.won,true);
    if(site.construction)acts+='<p>'+(delivered?'Строители работают. Предприятие скоро запустится.':'Строители на площадке, ожидают материалы.')+'</p>';
    else if(crewOnWay)acts+='<p>Строители в пути. Стройка начнётся, когда команда и материалы прибудут на площадку.</p>';
    else if(!covered)acts+='<p class="subtle">Сначала отправьте все материалы. Затем можно отправить строителей, не дожидаясь разгрузки.</p>';
   }
   else if(id==='oil2'){sub+=' · запас '+site.stock+' нефти';acts='<div class="assignment-summary">'+(E.pipeConnected(s)?'Нефтепровод подключён':'Нужна непрерывная труба до города')+'</div>';button('oil-pipe','Проложить трубу','1,5 железа / клетка · на карте',s.won,true);button('toggle-site',site.enabled?'Приостановить добычу':'Возобновить добычу','Оплаченный цикл завершится',s.won);}
   else if(site&&id!=='asphalt'){sub+=' · запас '+site.stock;const assigned=s.trucks.filter(t=>t.job?.type==='haul'&&t.job.target===id&&!t.stop);if(assigned.length){acts+='<p class="haul-assigned">Вывоз назначен · '+assigned.map(t=>'машина '+t.id).join(', ')+'</p>';button('haul-transport','Управление вывозом','Посмотреть машину или завершить маршрут');}else button('haul','Организовать вывоз','Выбрать машину · повторять рейсы',s.won,true);button('toggle-site',site.enabled?'Приостановить добычу':'Возобновить добычу','Управление добычей независимо от перевозок',s.won);}
   else if(id==='asphalt'){sub+=' · щебень на складе '+s.city.gravel;button('toggle-asphalt',s.enabled.asphalt?'Приостановить завод':'Включить завод','2 щебня → 2 асфальта',s.won,true);}
   else if(id==='center'){const route=E.routeInfo(s,'center');acts+='<div class="assignment-summary">'+(route.capacity===8?'Дорога подключена к въезду · груз до 8':'Дорога не подключена к въезду · груз до 4')+'<br><small>'+(route.capacity===8?'Весь путь проходит по асфальту.':'Доведите непрерывную дорогу до отмеченного въезда хаба. На готовых участках машина едет быстрее.')+'</small></div>';button('goal','Доставить в хаб','Недостающий груз · один рейс',s.won,true);}
   else if(id==='oil'){button('production','Открыть производство','Скважина, НПЗ и металлургия');}
  }
  markup('details','<div class="card-path">'+path+'</div><header class="selected-header"><div class="selected-disc">'+siteIcon(s,disc)+'</div><div class="selected-heading"><h2>'+title+'</h2><p class="card-subtitle">'+sub+'</p></div></header><div class="card-orbit"><div class="action-list">'+acts+'</div></div><div class="card-message" role="status">'+message+'</div>'+(pending?'<button class="card-back" data-action="cancel">Отменить назначение</button>':''));
  renderTutorial(s);
  if(focus){const b=$('details').querySelector('[data-action="'+focus+'"]');if(b&&!b.disabled&&document.activeElement===document.body)b.focus({preventScroll:true});}
 }
 function handleAction(action){const s=ctx.state();if(['materials','crew','haul','goal'].includes(action)){begin(action);return;}
  if(action==='cancel'){notice=pending?.sent?'Оставшееся назначение отменено. Уже отправленные машины продолжают рейсы.':'Назначение отменено. Ресурсы не списаны.';pending=null;refresh();return;}
    if(action==='resume'){$('pause').click();if(pending?.truck&&!s.paused)dispatch();return;}
  if(action==='haul-transport'){const truck=s.trucks.find(t=>t.job?.type==='haul'&&t.job.target===ctx.selected()&&!t.stop);if(truck)chooseTruck(truck.id);return;}
  if(action==='stop'){ctx.perform(()=>E.stopTruck(s,ctx.truck()));return;}
  if(action==='open-target'){chooseSite(s.trucks.find(t=>t.id===ctx.truck()).job.target);return;}
  if(action==='production'){$('operations').showModal();return;}
  if(action==='oil-pipe'){$('pipeTool').click();return;}
  ctx.perform(()=>{if(action==='toggle-site'){s.sites[ctx.selected()].enabled=!s.sites[ctx.selected()].enabled;return true;}if(action==='toggle-asphalt'){s.enabled.asphalt=!s.enabled.asphalt;return true;}return false;});
 }
 function tutorialStep(s){
  if(s.won)return {title:'Заказ выполнен!',text:'Вы освоили цепочку снабжения. Можно рассмотреть результат или начать новую партию.',target:'#objective',done:true};
  if(s.paused)return {title:s.time?'Продолжите игру':'Начнём с одной доставки',text:s.time?'Нажмите «Продолжить» над картой, чтобы продолжить текущий шаг обучения.':'Нажмите «Начать» над картой. Затем доставим материалы на железный рудник.',target:'#pause'};
  if(pending&&!s.trucks.some(t=>inspect(E,s,t.id,pending.type,pending.target).ok))return {title:'Сейчас нет подходящей машины',text:'Причина указана в карточке действия. Если все машины заняты, отмените назначение и дождитесь возвращения или завершите регулярный маршрут через транспорт.',target:'[data-action="cancel"]'};
  if(pending)return {title:'Выберите грузовик',text:'Нажмите подсвеченную свободную машину внизу справа. Она сразу отправится выполнять выбранное действие.',target:'.truck-button.eligible'};
  function build(id){const site=s.sites[id];if(site.construction)return Object.entries(E.costs[id]).every(([k,n])=>site.received[k]>=n)?{title:'Идёт строительство',text:'Строители прибыли и возводят предприятие. После завершения начнётся производство.',target:'#details'}:{title:'Строители ждут материалы',text:'Команда уже на площадке. Строительство начнётся после прибытия последнего груза.',target:'#fleet'};if(s.trucks.some(t=>t.job?.type==='crew'&&t.job.target===id))return {title:'Строители едут на объект',text:'Строительство начнётся, когда команда и все материалы прибудут на площадку.',target:'#fleet'};if(!s.trucks.some(t=>!t.job&&!t.leg)){const haul=s.trucks.find(t=>t.job?.type==='haul'&&!t.stop);if(haul)return mode==='truck'&&ctx.truck()===haul.id?{title:'Освободите машину',text:'Нажмите «Завершить маршрут». Машина вернётся в город с доступным грузом.',target:'[data-action="stop"]'}:{title:'Нужна свободная машина',text:'Нажмите машину '+haul.id+' внизу справа, чтобы отозвать её с регулярного вывоза.',target:'[data-truck="'+haul.id+'"]'};return {title:'Дождитесь свободной машины',text:'Грузовики завершат текущие рейсы и вернутся в город.',target:'#fleet'};}if(ctx.selected()!==id||mode!=='site')return {title:'Откройте '+E.label(id).toLowerCase(),text:'Нажмите выделенное предприятие справа или его модель на карте.',target:'[data-site="'+id+'"]'};
   if(site.construction)return Object.entries(E.costs[id]).every(([k,n])=>site.received[k]>=n)?{title:'Идёт строительство',text:'Строители прибыли и возводят предприятие. После завершения начнётся производство.',target:'#details'}:{title:'Строители ждут материалы',text:'Команда уже на площадке. Строительство начнётся после прибытия последнего груза.',target:'#fleet'};
   const delivered=Object.entries(E.costs[id]).every(([k,n])=>site.received[k]>=n),covered=Object.entries(E.costs[id]).every(([k,n])=>site.received[k]+site.incoming[k]>=n);
   if(covered)return {title:'Теперь отправьте строителей',text:s.builder!==null?'Команда ещё на другом задании. Дождитесь её возвращения.':(delivered?'Материалы уже на площадке. ':'Все материалы уже отправлены. ')+'Нажмите «Отправить строителей», затем выберите свободную машину. Команда дождётся последней доставки.',target:s.builder!==null?'#fleet':'[data-action="crew"]'};
   return {title:'Доставьте материалы',text:'Нажмите «Привезти материалы», затем выберите свободный грузовик. Если груз не помещается, отправьте ещё один рейс.',target:'[data-action="materials"]'};
  }
  if(!s.sites.iron.active)return build('iron');
  if(!tutorialDelivered&&!s.sites.iron.enabled&&!s.sites.iron.stock){if(ctx.selected()!=='iron'||mode!=='site')return {title:'Возобновите добычу',text:'Откройте железный рудник, чтобы включить производство руды.',target:'[data-site="iron"]'};return {title:'Включите рудник',text:'Нажмите «Возобновить добычу». Затем можно организовать вывоз.',target:'[data-action="toggle-site"]'};}
  if(!tutorialDelivered){const haul=s.trucks.find(t=>t.job?.type==='haul'&&t.job.target==='iron');
   if(tutorialWatch){const watched=s.trucks.find(t=>t.id===tutorialWatch.id);if(!watched?.job||watched.trip>tutorialWatch.trip){tutorialDelivered=true;tutorialWatch=null;saveTutorial();}}
   if(!tutorialDelivered&&haul){if(haul.leg?.kind==='back'&&Object.keys(haul.cargo).length&&!tutorialWatch){tutorialWatch={id:haul.id,trip:haul.trip};saveTutorial();}return {title:haul.leg?.kind==='back'?'Первая руда едет в город':'Рудник работает',text:'Грузовик дождётся полного груза и отвезёт руду в город. Металлургия автоматически превратит её в железо.',target:'#fleet'};}
   if(!tutorialDelivered){if(ctx.selected()!=='iron'||mode!=='site')return {title:'Рудник построен',text:'Откройте железный рудник. Теперь организуем вывоз добытой руды.',target:'[data-site="iron"]'};return {title:'Организуйте вывоз',text:'Нажмите «Организовать вывоз», затем выберите машину. Она будет повторять рейсы до отзыва через раздел транспорта.',target:'[data-action="haul"]'};}
  }
  return {title:'Первый цикл завершён',text:'Руда доставлена в город, металлургия перерабатывает её автоматически. Теперь выбирайте стратегию сами: стройте медный рудник и карьер. Чтобы освободить грузовик, выберите его в разделе транспорта и завершите маршрут.',target:'[data-site="copper"]',done:true};
 }
 function roadStep(s){
  const initialRoads=new Set((E.initialRoadCells||[]).map(p=>Array.isArray(p)?p.join(','):p));
  initialRoads.add(E.positions.city.join(','));
  for(const node of E.travelNodes||[])if(node.site==='city'||node.id==='city')initialRoads.add(node.position.join(','));
  const hasPaintedRoad=s.roads.some(k=>!initialRoads.has(k));
  if(pending)return {title:'Выберите грузовик',text:'Выберите подсвеченную свободную машину. Она сразу отправится на выбранное задание.',target:'.truck-button.eligible'};
  if(!s.sites.gravel.active&&s.city.asphalt<2)return {title:'Сначала постройте карьер',text:'Для асфальта нужен щебень. Откройте карьер, доставьте материалы и отправьте строителей. После строительства организуйте вывоз.',target:ctx.selected()==='gravel'?'#details':'[data-site="gravel"]'};
  if(s.paused)return {title:'Завод готов: доступны дороги',text:'Продолжите игру, чтобы выпустить асфальт и построить дорогу.',target:'#pause'};
  const gravelHaul=s.trucks.some(t=>t.job?.type==='haul'&&t.job.target==='gravel');
  if(!s.city.asphalt&&!s.production.asphalt&&!hasPaintedRoad&&!gravelHaul){if(ctx.selected()!=='gravel'||mode!=='site')return {title:'Нужен щебень для асфальта',text:'Откройте карьер. Чтобы завод начал выпускать асфальт, организуйте вывоз щебня в город.',target:'[data-site="gravel"]'};return {title:'Доставьте щебень',text:'Нажмите «Организовать вывоз» и выберите машину. Асфальтовый завод будет работать автоматически.',target:'[data-action="haul"]'};}
  if(!roadHintDone){if(hasPaintedRoad){roadHintDone=true;saveTutorial();}else return {title:'Открыто строительство дорог',text:s.city.asphalt<2?'Завод построен. Дождитесь щебня и первых 2 единиц асфальта. Если завод остановлен, включите его в карточке предприятия.':'Нажмите «Дорога» под картой и проведите от города по соседним клеткам. Каждая клетка стоит 2 асфальта. До предприятия дорога должна быть непрерывной.',target:s.city.asphalt<2?'[data-site="asphalt"]':'#roadTool'};}
  return {title:'Основы освоены',text:'Теперь выбирайте порядок развития сами. Завершить регулярный вывоз можно через машину. Для победы доставьте заказ в хаб.',target:'[data-site="center"]',done:true};
 }
 function renderTutorial(s){
  if(typeof LogisticsCoach!=='undefined'){if($('tutorial'))$('tutorial').hidden=true;return;}
  if(document.querySelectorAll)for(const el of document.querySelectorAll('.tutorial-focus'))el.classList.remove('tutorial-focus');
  const panel=$('tutorial');if(!panel)return;const roadContext=!tutorialActive&&!roadHintDone&&s.sites.asphalt.active&&!s.won;panel.hidden=!tutorialActive&&!roadContext;
  if(panel.hidden)return;
  const step=roadContext?roadStep(s):tutorialStep(s);
  markup('tutorial','<span class="tutorial-kicker">ОБУЧЕНИЕ · СЛЕДУЮЩИЙ ШАГ</span><strong>'+step.title+'</strong><p>'+step.text+'</p><button data-tutorial="dismiss">'+(step.done?'Завершить обучение':'Пропустить обучение')+'</button>');
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
const api={create,inspect,icon};if(typeof module==='object'&&module.exports)module.exports=api;else root.LogisticsCardUI=api;
})(typeof globalThis!=='undefined'?globalThis:this);
