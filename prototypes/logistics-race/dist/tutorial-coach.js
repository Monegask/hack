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
 if(site.construction||s.trucks.some(t=>t.job?.type==='crew'&&t.job.target===id))return make('build-wait-'+id,site.construction?'Команда на площадке':'Строители в пути','Стройка начнётся, когда прибудут и команда, и все материалы. После работы машина вернётся в город.','#fleet',{site:id});
 if(!free){const haul=s.trucks.find(t=>t.job?.type==='haul'&&!t.stop);return haul?make('need-truck','Нужна свободная машина','Открой эту машину и заверши регулярный маршрут. Она вернётся с доступным грузом.',v.mode==='truck'&&v.truck===haul.id?'[data-action="stop"]':'[data-truck="'+haul.id+'"]'):make('wait-truck','Машины возвращаются','Подожди возвращения одного грузовика: стройматериалы и строители едут отдельными рейсами.','#fleet');}
 if(v.selected!==id||v.mode!=='site')return make('select-'+id,'Открой '+label.toLowerCase(),'Выбери площадку на карте или её значок справа. Посмотрим, что нужно для постройки.','[data-site="'+id+'"]',{site:id});
 const covered=Object.entries(E.costs[id]).every(([k,n])=>site.received[k]+site.incoming[k]>=n);
 if(covered)return make('crew-'+id,'Теперь — строительная команда','Все материалы уже доставлены или едут. Нажми «Отправить строителей», затем выбери свободную машину.','[data-action="crew"]');
 const cost=Object.entries(E.costs[id]).map(([k,n])=>n+' '+E.names[k].toLowerCase()).join(' и '),capacity=E.routeInfo(s,id).capacity;
 return make('materials-'+id,'Привези материалы',id==='iron'?'Доставь материалы к руднику, чтобы построить его. Нужны 5 железа и 1 медь.':label+': '+cost+'. Вместимость здесь — '+capacity+'. Если всё не помещается, отправь второй груз. Потом повезём строителей.','[data-action="materials"]');
}
function pendingStep(E,s,v){
 if(!v.pending)return null;
 const suitable=s.trucks.some(t=>{if(t.job||t.leg)return false;const copy=JSON.parse(JSON.stringify(s));copy.paused=false;return E.start(copy,t.id,v.pending.type,v.pending.target);});
 if(!suitable)return make('no-eligible','Сейчас рейс недоступен','Причина показана в карточке. Проверь топливо и груз; если машины заняты, отмени назначение и дождись возврата.','[data-action="cancel"]');
 return make('pick-truck','Выбери грузовик',v.pending.type==='materials'?(s.trucks.some(t=>t.job?.type==='materials'&&t.job.target===v.pending.target)?'Назначь ещё одну машину, чтобы привезти материалы быстрее. Как только их будет достаточно, отправим строителей.':'Выбери машину, которая выполнит доставку. Ты можешь отвезти до 4 единиц по пересечённой местности.'):s.paused?'Выбери свободную машину. Затем появится «Продолжить и отправить».':'Нажатие подходящей машины сразу отправит её в рейс. Топливо оплачивает путь туда и обратно.','.truck-button.eligible',v.pending.type==='crew'?{pose:'peek'}:{});
}
function step(E,s,v,p,f){
 if(s.won)return make('won','Заказ доставлен','Хаб получил весь заказ. Можно рассмотреть результат или начать новую партию.','#objective',{finish:true});
 if(p.chapter==='menu')return make('menu','Что показать?','Можно пройти основы в этой партии или открыть отдельную учебную карту. Текущие работы и сохранение сохранятся.','#tutorialReplay',{menu:true,hold:true});
 const intro=[
  make('intro-goal','Цель игры - снабдить хаб ресурсами','В игре победит тот, кто первым доставит в хаб '+s.goal.iron+' железа, '+s.goal.copper+' меди и '+s.goal.asphalt+' асфальта.','[data-site="center"]',{site:'center'}),
  make('intro-stock','Стартовый набор','На панели ты видишь то, какие ресурсы у тебя есть для старта. Пользуйся топливом, железом и медью, но расходуй умно: пока нет добычи, запас не бесконечен.','#resources',{pose:'up'}),
  make('intro-city','Переработка','В городе находятся НПЗ и металлургические заводы, которые перерабатывают сырьё. Также к городу уже подключена первая нефтяная скважина, она даст тебе топливо на первых порах.','[data-site="city"]',{site:'city',mapSites:['city','oil'],pose:'folded'})
 ];
 if(p.chapter==='core'&&p.intro<INTRO_COUNT)return {...intro[p.intro],manual:true,hold:true,count:(p.intro+1)+'/'+INTRO_COUNT};
 if(p.chapter==='road'&&p.intro===0)return make('road-intro','Дорожная сеть доступна','Дороги ускоряют машины. Груз увеличится с 4 до 8 только на непрерывной дороге от города до въезда предприятия. Нажми «Дорога», зажми левую кнопку и веди по соседним клеткам, обходя горы. Можно строить по диагонали. Каждая новая клетка сразу стоит 2 асфальта; материалы и строителей возить не нужно. Нажми «Дорога» повторно для выхода.','#roadTool',{manual:true,hold:true});
 if(p.chapter==='pipe'&&p.intro===0)return make('pipe-intro','Сначала оцени всю цепочку','Вторая скважина увеличивает добычу нефти для выпуска топлива на городском НПЗ. Сначала привези материалы и строителей, затем соедини её с городской сетью непрерывной трубой. Машины нефть не возят. Новая клетка трубы стоит 1,5 железа; труба строится сразу, без доставки материалов и команды.','#pipeTool',{manual:true,hold:true});
 if(v.drawing&&p.chapter!=='road'&&p.chapter!=='pipe')return make('exit-drawing','Вернись к выбору объектов','Нажми активный инструмент ещё раз. Во время рисования выбор предприятий и машин отключён.',v.drawing==='pipe'?'#pipeTool':'#roadTool');
 const pending=pendingStep(E,s,v);if(pending)return pending;
 if(s.paused)return make('resume',s.time?'Продолжи игру':'Начни игру','Нажми кнопку «'+(s.time?'Продолжить':'Начать')+'» над картой.','#pause',{pose:'up',dimMap:true});
 if(p.chapter==='core'){
  const b=buildStep(E,s,v,'iron');if(b)return b;
  if(!f.producedIron){
   if(f.oreReturned){if(!s.enabled.metal)return make('enable-metal','Включи металлургию','Руда уже в городе. Открой производство и возобнови металлургию, чтобы получить железо.',v.operations?'[data-plant="metal"]':'#operationsOpen');return make('smelt','Руда превращается в металл','Дождись первого завершённого цикла металлургии. Стартовое железо на складе ещё не означает, что этот цикл пройден.','#resources .resource:nth-child(2)');}
   const haul=s.trucks.find(t=>t.job?.type==='haul'&&t.job.target==='iron');
   if(haul)return make('haul-wait',haul.leg?.kind==='back'?'Первая руда едет в город':'Грузовик ждёт руду','Это нормальное ожидание полной загрузки. Машина отвезёт сырьё в город и продолжит вывоз автоматически.','[data-truck="'+haul.id+'"]',{site:'iron'});
   if(!s.sites.iron.enabled)return make('enable-iron','Возобнови добычу','Открой рудник и включи добычу. Остановка добычи и завершение маршрута — разные команды.',v.selected==='iron'&&v.mode==='site'?'[data-action="toggle-site"]':'[data-site="iron"]');
   return v.selected==='iron'&&v.mode==='site'?make('haul','Руда остаётся у рудника','Нажми «Организовать вывоз», затем выбери машину. Только после доставки в город руда попадёт в металлургию.','[data-action="haul"]'):make('open-haul','Теперь организуем вывоз','Выбери железный рудник. Построить его недостаточно: сырьё нужно перевезти в город.','[data-site="iron"]',{site:'iron'});
  }
  const haul=s.trucks.find(t=>t.job?.type==='haul'&&t.job.target==='iron');
  if(haul&&!f.truckHelpRead)return make('truck-help','Управление задачами машин','Чтобы управлять задачами машин, ты можешь нажать на их иконку и выбрать нужное действие.','[data-truck="'+haul.id+'"]',{manual:true,hold:true});
  return make('core-done','Первый цикл готов','Ты построил рудник, вывез руду и получил металл. Дальше нужны медь и асфальт. Другие подсказки доступны в меню «Темы».','#resources',{finish:true,hold:true});
 }
 if(p.chapter==='copper'){const b=buildStep(E,s,v,'copper');return b||make('copper-done','Теперь вывоз меди','Медная руда тоже едет в город и перерабатывается автоматически. Назначай вывоз через рудник, управляй им через машину.','[data-site="copper"]',{finish:true});}
 if(p.chapter==='asphalt'){
  if(!s.sites.gravel.active)return buildStep(E,s,v,'gravel');
  if(!s.sites.asphalt.active)return buildStep(E,s,v,'asphalt');
  if(s.city.asphalt>0)return make('asphalt-done','Асфальт появился','Он нужен и дорогам, и заказу хаба. Развивая сеть, оставляй запас на доставку.','#resources .resource:nth-child(4)',{finish:true});
  if(!s.enabled.asphalt)return make('enable-asphalt','Возобнови завод','Завод построен, но выключен. Открой его карточку и включи производство.',v.selected==='asphalt'&&v.mode==='site'?'[data-action="toggle-asphalt"]':'[data-site="asphalt"]');
  if(!s.sites.gravel.enabled)return make('enable-quarry','Возобнови добычу щебня','Без добычи машина будет ждать пустой карьер. Открой карьер и возобнови работу.',v.selected==='gravel'&&v.mode==='site'?'[data-action="toggle-site"]':'[data-site="gravel"]');
  const haul=s.trucks.find(t=>t.job?.type==='haul'&&t.job.target==='gravel');if(haul)return make('gravel-wait','Щебень нужен в городе','Грузовик дождётся груза. Построенный асфальтовый завод использует городской склад автоматически — отдельный рейс к заводу не нужен.','[data-truck="'+haul.id+'"]');
  return v.selected==='gravel'&&v.mode==='site'?make('gravel-haul','Привези щебень','Нажми «Организовать вывоз», затем выбери машину.','[data-action="haul"]'):make('open-gravel','Карьер → город → асфальт','Открой карьер и организуй вывоз щебня в город.','[data-site="gravel"]',{site:'gravel'});
 }
 if(p.chapter==='road'){
  if(s.roads.length>p.baseline&&v.drawing!=='road')return make('road-done','Дорога построена','По готовым участкам машина едет быстрее. Вместимость станет 8 только на полностью дорожном маршруте до въезда.','#roadTool',{finish:true});
  if(s.roads.length>p.baseline)return make('road-exit','Участок готов','Асфальт уже списан. Нажми «Дорога» ещё раз, чтобы выйти из рисования и снова выбирать объекты.','#roadTool');
  if(s.city.asphalt<2)return make('road-no-asphalt','Сначала получи асфальт','На новую клетку нужно 2 асфальта. Построй карьер и асфальтовый завод, доставляй щебень в город.','[data-site="asphalt"]',{finish:true});
  if(v.drawing==='road')return make('road-draw','Зажми и проведи линию','Начинай у города или готовой дороги, веди по соседним клеткам. Каждая новая клетка сразу стоит 2 асфальта. Достаточно короткого участка.','#map',{gesture:'road'});
  return make('road-open','Машины уже ездят по грунту','Дорога ускоряет перевозку. Нажми «Дорога»: покажу, как провести линию. Асфальт нужен и хабу.','#roadTool');
 }
 if(p.chapter==='pipe'){
  if(!s.sites.oil2.active)return buildStep(E,s,v,'oil2');
  if(!s.sites.oil2.enabled)return make('enable-well','Возобнови вторую скважину','Чтобы проверить поступление нефти, нужна работающая скважина.',v.selected==='oil2'&&v.mode==='site'?'[data-action="toggle-site"]':'[data-site="oil2"]');
  if(E.pipeConnected(s)){if(v.drawing==='pipe')return make('pipe-exit','Соединение готово','Нажми «Нефтепровод» ещё раз, чтобы выйти из инструмента. Проверим первое поступление нефти.','#pipeTool');if(!f.pipeFlow)return make('pipe-flow','Теперь дождись поступления нефти','Сеть уже соединена. Скважина должна накопить нефть; труба доставит её в город, а НПЗ переработает. Если добыча выключена, возобнови её.','[data-site="oil2"]',{site:'oil2'});return make('pipe-done','Нефть поступила в город','Непрерывная труба заработала. НПЗ превращает нефть в топливо, без участия машин.','#pipeTool',{finish:true});}
  if(v.drawing==='pipe')return make('pipe-draw','Соедини скважину с городской сетью','Начни у городской трубы и, зажав левую кнопку, веди линию до въезда второй скважины по соседним клеткам, обходя горы. Диагонали разрешены; новая клетка сразу стоит 1,5 железа. Незавершённая ветка нефть не доставляет. Для выхода нажми «Нефтепровод» ещё раз.','#map',{gesture:'pipe'});
  return make('pipe-open','Скважине нужна непрерывная труба','Нефть остаётся на месте, пока нет соединения. Нажми «Нефтепровод». Убедись, что хватит железа на всю сеть.','#pipeTool');
 }
 if(p.chapter==='goal'){
  if(f.delivered)return make('goal-done','Груз зачтён','Теперь заказ хаба вырос. Груз в пути и запас в городе считались отдельно. Каждую следующую поставку назначай снова.','#objective',{finish:true});
  const trip=s.trucks.find(t=>t.job?.type==='goal'&&t.leg?.kind==='out');if(trip)return make('goal-wait','Груз ещё в пути','Дождись разгрузки. Только прибытие увеличивает выполненную часть заказа; поставки можно делать частями.','#objective',{site:'center'});
  return v.selected==='center'&&v.mode==='site'?make('goal-send','Отправь готовые материалы в хаб','Нажми «Доставить в хаб», затем выбери машину. Рейс разовый. Материалы на складе ещё нужны и для развития.','[data-action="goal"]'):make('goal-open','Запас на складе ещё не заказ','Открой хаб и назначь доставку. Для победы ресурсы должны физически приехать.','[data-site="center"]',{site:'center'});
 }
 return make('fleet','Больше машин — больше возможностей','Сборка стоит 3 железа, 1 медь и 0,4 топлива и занимает 12 секунд. Третья машина полезна, но для окончания обучения не обязательна.','#buy',{finish:true});
}
function create(ctx,stored){
 const s=ctx.state(),p={version:2,coreDone:false,seen:{},skipped:false,...stored,seen:{...stored?.seen},chapter:null,intro:0,visible:false,baseline:0};
 let ref=s,old=snapshot(s),facts={oreReturned:s.city.ironOre>0||s.production.metal?.kind==='iron',producedIron:false,recalled:false,delivered:false},loan=null;
 function hold(){if(!loan)loan={state:ctx.state(),paused:ctx.state().paused,touched:false};ctx.state().paused=true;}
 function release(){if(loan){if(loan.state===ctx.state()&&!loan.touched&&!ctx.state().won)ctx.state().paused=loan.paused;loan=null;}}
 function persist(){ctx.save?.({version:2,coreDone:p.coreDone,seen:{...p.seen},skipped:p.skipped});}
 function start(chapter='core'){release();p.chapter=chapter;p.visible=true;if(chapter==='core')p.skipped=false;p.intro=['core','pipe','road'].includes(chapter)?0:INTRO_COUNT;p.baseline=ctx.state().roads.length;if(chapter==='goal')facts.delivered=false;if(chapter==='menu'||chapter==='core')hold();persist();}
 function tick(){const s=ctx.state();if(ref!==s){release();ref=s;old=snapshot(s);facts={oreReturned:s.city.ironOre>0,producedIron:false,recalled:false,delivered:false};p.visible=false;p.chapter=null;if(!p.coreDone&&!p.skipped&&s.time===0)start('core');}observe(facts,old,s);old=snapshot(s);}
 function current(){tick();const s=ctx.state(),v=ctx.view();
  if(!p.visible&&!p.skipped&&p.coreDone){let chapter=null;if(v.drawing==='road'&&!p.seen.road)chapter='road';else if(v.drawing==='pipe'&&!p.seen.pipe)chapter='pipe';else if((v.selected==='oil2'||s.sites.oil2.active)&&!p.seen.pipe)chapter='pipe';else if(s.sites.asphalt.active&&!p.seen.road)chapter='road';else if(v.selected==='center'&&!p.seen.goal)chapter='goal';else if(v.selected==='copper'&&!p.seen.copper)chapter='copper';else if(['gravel','asphalt'].includes(v.selected)&&!p.seen.asphalt)chapter='asphalt';else if(s.production.vehicle&&!p.seen.fleet)chapter='fleet';if(chapter)start(chapter);}
  if(!p.visible)return null;const result=step(ctx.E,loan&&!loan.touched?{...s,paused:loan.paused}:s,v,p,facts);if(result.hold)hold();else release();return result;
 }
 function next(){const result=current();if(!result)return;if(result.manual){if(result.id==='truck-help')facts.truckHelpRead=true;else p.intro++;if(p.chapter!=='core'||p.intro===INTRO_COUNT)release();}else if(result.finish){if(p.chapter==='core'){p.coreDone=true;p.skipped=true;}else p.seen[p.chapter]=true;p.visible=false;p.chapter=null;release();}persist();ctx.refresh?.();}
 function dismiss(){p.skipped=true;p.visible=false;p.chapter=null;release();persist();ctx.refresh?.();}
 function closeChapter(){if(p.chapter&&p.chapter!=='menu')p.seen[p.chapter]=true;p.visible=false;p.chapter=null;release();persist();ctx.refresh?.();}
 if(!p.coreDone&&!p.skipped&&s.time===0)start('core');
 return {p,start,current,next,dismiss,closeChapter,observe:tick,userPause:()=>{if(loan)loan.touched=true;},facts:()=>({...facts})};
}
function mount(ctx){
 const practice=document.body.dataset.practice==='true'&&document.body.dataset.race!=='true';let stored;
 if(!practice)try{stored=JSON.parse(localStorage.getItem(KEY));if(!stored){const legacy=JSON.parse(localStorage.getItem('logistics-tutorial-v1'));if(legacy?.active===false)stored={coreDone:true,skipped:true};}}catch{}
 const controller=create({...ctx,save:data=>{if(!practice)try{localStorage.setItem(KEY,JSON.stringify(data));}catch{}}},stored);
 const layer=document.createElement('div');layer.id='coachLayer';layer.className='coach-layer';layer.hidden=true;
 layer.innerHTML='<div class="coach-map-dim" aria-hidden="true"></div><div class="coach-spotlight" aria-hidden="true"></div><svg class="coach-gesture-svg" aria-hidden="true"><path fill="none"/><circle class="coach-origin" r="6"/><circle class="coach-cursor" r="7"/></svg><div class="coach-figure" aria-hidden="true"></div><section class="coach-bubble" aria-label="Обучение" aria-live="polite"><div class="coach-eyebrow"><span></span></div><h2></h2><p></p><div class="coach-actions"></div></section><div class="coach-gesture" aria-hidden="true">Зажми и проведи · образец жеста</div>';
 document.body.append(layer);const bubble=layer.querySelector('.coach-bubble'),figure=layer.querySelector('.coach-figure'),spot=layer.querySelector('.coach-spotlight'),mapDim=layer.querySelector('.coach-map-dim'),gesture=layer.querySelector('.coach-gesture'),guide=layer.querySelector('.coach-gesture-svg');let active=null,signature='',target=null,guideKey='',guideCells=[];
 const button=(action,label,primary=false)=>'<button type="button" data-coach="'+action+'"'+(primary?' class="coach-primary"':'')+'>'+label+'</button>';
 const raceLink=()=>'<a data-coach="race" href="'+(location.protocol==='file:'?'logistics-race-bot.html':'bot-race.html')+'">Перейти к гонке ↗</a>';
 function render(){active=controller.current();layer.hidden=!active;if(!active)return;
  const sig=JSON.stringify([active,controller.p.chapter]);if(signature!==sig){signature=sig;delete layer.dataset.framed;layer.dataset.step=active.id;layer.dataset.chapter=controller.p.chapter;figure.dataset.pose=active.pose||'explain';bubble.querySelector('.coach-eyebrow span').textContent=active.count||({core:'ОСНОВЫ',menu:'ПОМОЩЬ',road:'ДОРОГИ',pipe:'НЕФТЕПРОВОД',goal:'ЗАКАЗ',asphalt:'АСФАЛЬТ',copper:'МЕДЬ',fleet:'ТРАНСПОРТ'}[controller.p.chapter]||'ПОМОЩЬ');bubble.querySelector('h2').textContent=active.title;bubble.querySelector('p').textContent=active.text;let actions='';
   if(active.menu){for(const [key,label] of [['core','Основы'],['road','Дороги'],['pipe','Труба'],['asphalt','Асфальт'],['goal','Доставка'],['fleet','Машины']])actions+=button('lesson:'+key,label);actions+='<a href="'+(location.protocol==='file:'?'logistics-race-tutorial.html':'game-3d-tutorial.html')+'">Отдельная учебная партия ↗</a>';if(document.body.dataset.training==='true')actions+=raceLink();actions+=button('close','Вернуться к игре');}
   else{if(active.manual||active.finish)actions+=button('next',active.finish?'Продолжить самостоятельно':'Дальше',true);if(active.id==='core-done'&&document.body.dataset.training==='true')actions+=raceLink();actions+=button('menu','Темы');actions+=button('dismiss','Пропустить обучение');}
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
