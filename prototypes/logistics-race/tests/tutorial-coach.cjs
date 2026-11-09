const {test}=require('node:test'),assert=require('node:assert/strict'),E=require('../dist/engine.js'),C=require('../dist/tutorial-coach.js');
function harness(stored){let s=E.create(),view={selected:'iron',mode:'site',truck:1,pending:null,drawing:null};const saved=[];const c=C.create({E,state:()=>s,view:()=>view,save:v=>saved.push(structuredClone(v))},stored);return {c,get s(){return s;},view,saved,runUntil(fn,max=2000){for(let i=0;i<max*10&&!fn();i++){E.tick(s,.1);c.observe();}assert(fn(),'Expected real engine event');},replace(n){s=n;}};}
test('Intro pauses without paying fuel, skip restores a running game and suppresses later chapters',()=>{
 const h=harness({coreDone:false,skipped:true});h.s.paused=false;h.c.start('core');assert(h.s.paused);const resources=JSON.stringify(h.s.city);assert.equal(h.c.current().id,'intro-goal');h.c.dismiss();assert(!h.s.paused);assert.equal(JSON.stringify(h.s.city),resources);h.view.selected='oil2';assert.equal(h.c.current(),null);assert.equal(h.saved.at(-1).skipped,true);
});
test('User-owned pause is retained when a reading loan is closed',()=>{
 const h=harness({coreDone:true});h.s.paused=false;h.c.start('menu');assert(h.s.paused);h.c.userPause();h.c.closeChapter();assert(h.s.paused);h.c.start('core');for(let i=0;i<C.INTRO_COUNT;i++)h.c.next();assert(h.s.paused);assert.equal(h.c.current().id,'resume');
});
test('Real first loop requires two material loads, crew, ore return, paid smelting and recall',()=>{
 const h=harness();for(let i=0;i<C.INTRO_COUNT;i++)h.c.next();h.s.paused=false;assert.equal(h.c.current().id,'materials-iron');
 assert(E.start(h.s,1,'materials','iron'));h.c.observe();assert.equal(h.s.sites.iron.incoming.iron,4);assert.equal(h.c.current().id,'materials-iron');
 assert(E.start(h.s,2,'materials','iron'));h.c.observe();assert.equal(h.c.current().id,'wait-truck');h.runUntil(()=>!h.s.trucks[0].job);assert.equal(h.c.current().id,'crew-iron');
 assert(E.start(h.s,1,'crew','iron'));h.c.observe();h.runUntil(()=>h.s.sites.iron.active);assert.equal(h.c.facts().producedIron,false);h.runUntil(()=>!h.s.trucks[1].job);assert(E.start(h.s,2,'haul','iron'));h.c.observe();assert.equal(h.c.facts().producedIron,false);
 h.runUntil(()=>h.c.facts().oreReturned);assert.equal(h.c.current().id,'smelt');h.runUntil(()=>h.c.facts().producedIron);assert.equal(h.c.current().id,'truck-help');h.c.next();assert(!h.c.p.coreDone);
 assert(E.stopTruck(h.s,2));h.c.observe();h.runUntil(()=>!h.s.trucks[1].job);assert.equal(h.c.current().id,'core-done');assert(h.s.paused);assert.equal(h.c.current().id,'core-done','Reading pause must not replace finish with resume');h.c.next();assert(h.c.p.coreDone);assert(!h.s.paused);assert.equal(h.c.current(),null);
});
test('A loaded stock of starting iron cannot finish the first production lesson',()=>{
 const h=harness();for(let i=0;i<C.INTRO_COUNT;i++)h.c.next();h.s.paused=false;h.s.sites.iron.active=true;h.s.city.iron=100;h.c.observe();assert.equal(h.c.facts().producedIron,false);assert.notEqual(h.c.current().id,'core-done');
});
test('Pending assignments respect eligibility, paid departure, pause and shortage',()=>{
 const h=harness({coreDone:true,skipped:true});h.c.start('road');h.c.next();h.s.paused=false;h.view.pending={type:'materials',target:'iron',truck:null};const before=JSON.stringify(h.s);assert.equal(h.c.current().id,'pick-truck');assert.equal(JSON.stringify(h.s),before);h.s.fuel=0;assert.equal(h.c.current().id,'no-eligible');h.s.fuel=12;h.s.paused=true;h.view.pending.truck=1;assert.notEqual(h.c.current().id,'resume-send');
});
test('Drawing cannot be called a full-road connection; exit is part of road lesson',()=>{
 const h=harness({coreDone:true,skipped:true});h.s.paused=false;h.s.city.asphalt=2;h.c.start('road');h.c.next();h.view.drawing='road';assert.equal(h.c.current().id,'road-draw');const route=E.routeInfo(h.s,'iron');for(const cell of route.points)if(E.buildRoad(h.s,cell))break;assert.equal(h.c.current().id,'road-exit');h.view.drawing=null;assert.equal(h.c.current().id,'road-done');assert.equal(E.routeInfo(h.s,'iron').capacity,4);h.c.next();assert(h.c.p.seen.road);
});
test('Shipping only in transit is not a completed hub delivery',()=>{
 const h=harness({coreDone:true,skipped:true});h.s.paused=false;h.c.start('goal');h.view.selected='center';assert(E.start(h.s,1,'goal','center'));h.c.observe();assert.equal(h.c.current().id,'goal-wait');assert.equal(h.c.facts().delivered,false);h.runUntil(()=>h.s.delivered.iron>0);assert.equal(h.c.current().id,'goal-done');
});
test('Independent replay never swaps the game object or clears inventory; storage contains only learning metadata',()=>{
 const h=harness({coreDone:true,skipped:true});h.s.time=120;h.s.city.iron=7;const ref=h.s;h.c.start('menu');h.c.start('core');assert.equal(h.s,ref);assert.equal(h.s.city.iron,7);assert(!('city' in h.saved.at(-1)));assert(!('trucks' in h.saved.at(-1)));
});
test('Coach placements stay within the viewport and speech avoids the target at desktop and narrow widths',()=>{
 for(const width of [320,390,1280,1440]){const viewport={width,height:900},map={x:0,y:176,width:width<640?width:width-420,height:650};for(const target of [{x:width-180,y:430,width:160,height:58},{x:18,y:190,width:100,height:50},{x:width/2,y:400,width:60,height:30}]){const p=C.placement(target,map,viewport,null,245);assert(p.bubble.x>=0);assert(p.bubble.x+p.bubble.width<=width);assert(p.bubble.y>=0);assert(p.bubble.y+p.bubble.height<=900);assert(!(p.bubble.x<target.x+target.width&&p.bubble.x+p.bubble.width>target.x&&p.bubble.y<target.y+target.height&&p.bubble.y+p.bubble.height>target.y));}}
});
test('Ghost gestures contain only legal adjacent cells and never spend actual resources',()=>{
 const s=E.create(),before=JSON.stringify(s);for(const type of ['road','pipe']){const cells=C.sampleCells(E,s,type);assert(cells.length>=2);for(let i=1;i<cells.length;i++)assert(E.canStep(cells[i-1],cells[i]));const copy=structuredClone(s);copy.paused=false;copy.city.iron=copy.city.asphalt=100;for(const p of cells)if(!(type==='pipe'?E.onPipe:E.onRoad)(copy,p))assert((type==='pipe'?E.buildPipeCell:E.buildRoad)(copy,p));}assert.equal(JSON.stringify(s),before);
});
test('Pipe lesson requires leaving the tool and a real transfer before it reports success',()=>{
 const h=harness({coreDone:true,skipped:true});h.s.paused=false;h.s.sites.oil2.active=true;h.s.sites.oil2.stock=3;h.s.city.iron=100;h.c.start('pipe');assert.equal(h.c.current().id,'pipe-intro');h.c.next();let guard=0;while(!E.pipeConnected(h.s)&&guard++<100){for(const p of C.sampleCells(E,h.s,'pipe'))if(!E.onPipe(h.s,p))E.buildPipeCell(h.s,p);}assert(E.pipeConnected(h.s));h.view.drawing='pipe';assert.equal(h.c.current().id,'pipe-exit');h.view.drawing=null;assert.equal(h.c.current().id,'pipe-flow');h.runUntil(()=>h.c.facts().pipeFlow);assert.equal(h.c.current().id,'pipe-done');
});
test('Opening a help topic after skipping does not silently re-enable automatic late prompts',()=>{
 const h=harness({coreDone:true,skipped:true});h.c.start('menu');h.c.closeChapter();assert(h.c.p.skipped);h.c.start('fleet');h.s.paused=false;h.c.next();h.view.selected='oil2';assert(h.c.p.skipped);assert.equal(h.c.current(),null);
});
test('Revised introduction uses the approved order, three blocks and the real unchanged order quantities',()=>{
 const h=harness();let q=h.c.current();assert.equal(q.title,'Цель игры - снабдить хаб ресурсами');assert.match(q.text,/12 железа, 6 меди и 8 асфальта/);assert.equal(q.count,'1/3');h.c.next();q=h.c.current();assert.equal(q.title,'Стартовый набор');assert.equal(q.pose,'up');assert.match(q.text,/пока нет добычи, запас не бесконечен/);h.c.next();q=h.c.current();assert.equal(q.title,'Переработка');assert.equal(q.pose,'folded');assert.deepEqual(q.mapSites,['city','oil']);h.c.next();q=h.c.current();assert.equal(q.id,'resume');assert.equal(q.title,'Начни игру');assert.equal(q.pose,'up');assert(q.dimMap);assert(!q.manual);assert.deepEqual(h.s.goal,{iron:12,copper:6,asphalt:8});
});
test('Materials and truck text match the revised lesson while later assignment types retain their explanation',()=>{
 const s=E.create();s.paused=false;const v={selected:'iron',mode:'site',truck:1,pending:null};let q=C.buildStep(E,s,v,'iron');assert.equal(q.text,'Доставь материалы к руднику, чтобы построить его. Нужны 5 железа и 1 медь.');assert(!q.manual&&!q.dimMap);v.pending={type:'materials',target:'iron'};q=C.pendingStep(E,s,v);assert.equal(q.title,'Выбери грузовик');assert.match(q.text,/до 4 единиц/);assert.match(q.text,/до 4 единиц по пересечённой местности/);assert(!q.manual&&!q.dimMap);
});
test('Folded map pose sits above its target rather than beside it',()=>{
 for(const width of [390,1440]){const target={x:width/2-30,y:500,width:60,height:55},p=C.placement(target,{x:0,y:150,width:width<640?width:width-420,height:600},{width,height:900},'folded',240);assert.equal(p.pose,'folded');assert(p.character.y+p.character.height<target.y);}
});


test('Unlocking asphalt production automatically explains road construction and restores pause',()=>{
 const h=harness({coreDone:true});h.s.paused=false;h.s.sites.asphalt.active=true;
 assert.equal(h.c.current().id,'road-intro');assert(h.s.paused);assert.match(h.c.current().text,/с 4 до 8/);
 h.c.next();assert(!h.s.paused);assert.equal(h.c.current().id,'road-no-asphalt');
 h.s.city.asphalt=2;assert.equal(h.c.current().id,'road-open');h.view.drawing='road';assert.equal(h.c.current().id,'road-draw');
 h.c.closeChapter();assert.equal(h.c.current(),null);
});
test('Activating second well automatically introduces oil and pipe benefits, without spending resources',()=>{
 const h=harness({coreDone:true});h.s.paused=false;h.s.sites.oil2.active=true;const stock=JSON.stringify(h.s.city);
 assert.equal(h.c.current().id,'pipe-intro');assert.match(h.c.current().text,/увеличивает добычу/);assert(h.s.paused);assert.equal(JSON.stringify(h.s.city),stock);
 h.c.next();assert(!h.s.paused);assert.equal(h.c.current().id,'pipe-open');h.view.drawing='pipe';assert.equal(h.c.current().id,'pipe-draw');
});
test('Unlock lessons queue after the active chapter and stay suppressed when skipped',()=>{
 const h=harness({coreDone:true});h.s.paused=false;h.c.start('fleet');h.s.sites.asphalt.active=true;h.s.sites.oil2.active=true;
 assert.equal(h.c.current().id,'fleet');h.c.next();assert.equal(h.c.current().id,'pipe-intro');h.c.closeChapter();assert.equal(h.c.current().id,'road-intro');h.c.closeChapter();assert.equal(h.c.current(),null);
 const skipped=harness({coreDone:true,skipped:true});skipped.s.sites.asphalt.active=true;skipped.s.sites.oil2.active=true;assert.equal(skipped.c.current(),null);
});

test('Course finishes with active hauling and never auto-opens a later chapter',()=>{
 const h=harness();for(let i=0;i<C.INTRO_COUNT;i++)h.c.next();h.s.paused=false;
 assert(E.start(h.s,1,'materials','iron'));assert(E.start(h.s,2,'materials','iron'));h.runUntil(()=>!h.s.trucks[0].job);
 assert(E.start(h.s,1,'crew','iron'));h.runUntil(()=>h.s.sites.iron.active);h.runUntil(()=>!h.s.trucks[1].job);
 assert(E.start(h.s,2,'haul','iron'));h.runUntil(()=>h.c.facts().producedIron);
 assert.equal(h.c.current().id,'truck-help');h.c.next();assert.equal(h.c.current().id,'core-done');h.c.next();
 assert(h.s.trucks[1].job);assert(h.c.p.coreDone);h.s.sites.asphalt.active=true;h.s.sites.oil2.active=true;h.view.selected='copper';assert.equal(h.c.current(),null);
 h.c.start('road');assert.equal(h.c.current().id,'road-intro');
});
test('Second material truck gets its own instruction and target button is absent',()=>{
 const h=harness();h.s.paused=false;assert(E.start(h.s,1,'materials','iron'));h.view.pending={type:'materials',target:'iron'};
 const q=C.pendingStep(E,h.s,h.view);assert.equal(q.id,'pick-truck');assert.match(q.text,/another truck|ещё одну машину/);
 const source=require('node:fs').readFileSync(require.resolve('../dist/tutorial-coach.js'),'utf8');assert(!source.includes("button('reveal'"));assert(!source.includes("make('resume-send'"));
});
