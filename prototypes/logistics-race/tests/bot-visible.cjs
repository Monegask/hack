const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function raceHarness(shared=false){
 const nodes=new Map();
 function node(name=''){
  const n={name,children:[],dataset:{},attributes:{},textContent:'',disabled:false,hidden:false,open:false,buttons:[],append(...children){this.children.push(...children);},appendChild(child){this.append(child);},prepend(child){this.children.unshift(child);},before(){},scrollIntoView(){},setAttribute(k,v){this.attributes[k]=v;},showModal(){this.open=true;},querySelector(selector){if(selector==='details')return null;return get(this.name+':'+selector);},querySelectorAll(selector){return selector==='[data-territory]'?this.buttons:[];}};
  Object.defineProperty(n,'id',{set(id){this._id=id;nodes.set(id,this);},get(){return this._id;}});
  Object.defineProperty(n,'innerHTML',{set(html){this._html=html;for(const m of html.matchAll(/id="([^"]+)"/g))get(m[1]);this.buttons=[...html.matchAll(/data-territory="([^"]+)"/g)].map(m=>{const b=node();b.dataset.territory=m[1];b.closest=s=>s==='[data-territory]'?b:null;return b;});},get(){return this._html||'';}});
  return n;
 }
 function get(id){if(!nodes.has(id))nodes.set(id,node(id));return nodes.get(id);}
 const document={createElement:tag=>node(tag),getElementById:get,head:node('head'),querySelector:get};
 let reloads=0;const c=vm.createContext({console,Date,Math,document,location:{reload(){reloads++;}}});
 for(const file of shared?['engine.js','race-world.js','bot.js']:['engine.js','bot.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist',file),'utf8'),c);
 vm.runInContext(`const E=Logistics,$=id=>document.getElementById(id);let state=E.create(),winShown=false;function render(){};const fmt=n=>String(Math.round(n*10)/10),time=String;const map3d={focuses:[],states:[],focusTerritory(value){this.focuses.push(value);},setRivalState(s){this.states.push(s);this.rival=s;}};`,c);
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/bot-race.js'),'utf8'),c);
 return {run:code=>vm.runInContext(code,c),get,reloads:()=>reloads};
}

test('Shared-world restart regenerates the isolated page and real race ticks preserve the drawn layout',()=>{
 const h=raceHarness(true);h.run('var drawnLayout=JSON.stringify(globalRaceWorldEngines.layout);state.paused=false;for(let i=0;i<10;i++)E.tick(state,.1);render()');
 assert(h.run('JSON.stringify(globalRaceWorldEngines.layout)===drawnLayout'));assert.equal(h.run('state.time'),h.run('rival.state.time'));
 assert(h.run('map3d.rival===rival.state'));assert(h.run('RivalE===globalRaceWorldEngines.rival'));
 assert.equal(typeof h.get('confirmReset').onclick,'function');h.get('confirmReset').onclick();assert.equal(h.reloads(),1);
});

test('Race shows both territories by default and sends the actual bot state to the scene',()=>{
 const h=raceHarness();assert.equal(h.run('territory'),'both');assert.equal(h.run('map3d.focuses[0]'),'both');assert(h.run('map3d.rival===rival.state'));assert(h.run('map3d.rival!==state'));
 const overview=h.get('raceOverview');assert.doesNotMatch(overview.innerHTML,/data-territory|data-race-details|raceLead/);
 h.run('focusRaceTerritory("rival")');h.get('mapView').onclick();assert.equal(h.run('territory'),'both');
});
test('Compact progress shows percentages only, without delivery text, status or counts',()=>{
 const h=raceHarness();h.run('state.delivered.iron=3;rival.state.delivered.iron=6;rival.state.sites.iron.active=true;racePanel()');
 const comparison=h.get('raceComparison').innerHTML;
 assert.match(comparison,/Вы/);assert.match(comparison,/Соперник/);assert.match(comparison,/11.5%/);assert.match(comparison,/23.1%/);
 assert.doesNotMatch(comparison,/Доставлено|<small>|Построено|Развивает|Строит|Запускает/);
 h.run('state.outgoing.iron=9;racePanel()');assert.equal(h.get('raceComparison').innerHTML,comparison);
 h.run('state.delivered.iron=9;racePanel()');assert.match(h.get('raceComparison').innerHTML,/34.6%/);
});

test('Shared journal keeps separate real player and rival events and refreshes on reset',()=>{
 const h=raceHarness();assert(h.get('journal'));
 h.run('state.log=[{t:15,text:"Действие игрока"}];rival.state.log=[{t:16,text:"Действие соперника <test>"}];racePanel()');
 assert.match(h.get('rivalJournal').innerHTML,/16/);assert.match(h.get('rivalJournal').innerHTML,/Действие соперника &lt;test&gt;/);
 assert.doesNotMatch(h.get('rivalJournal').innerHTML,/Действие игрока/);
 h.run('state=E.create();render()');assert.doesNotMatch(h.get('rivalJournal').innerHTML,/Действие соперника/);
});

test('Rival selections are read-only and pause freezes both visible territories',()=>{
 const h=raceHarness();h.run('var beforeSelection=JSON.stringify(state);map3d.onRivalSelect("iron")');assert(h.run('JSON.stringify(state)===beforeSelection'));assert.equal(h.get('raceObject').hidden,false);assert.match(h.get('raceObject').textContent,/Железный рудник/);assert.match(h.get('raceObject').textContent,/Только просмотр/);
 h.run('state.paused=false;E.tick(state,.1);racePanel()');assert.equal(h.run('rival.state.paused'),false);assert.equal(h.run('state.time'),h.run('rival.state.time'));
 h.run('state.paused=true;racePanel();var frozenTime=rival.state.time;E.tick(state,1)');assert(h.run('rival.state.paused'));assert(h.run('rival.state.time===frozenTime'));
});
test('A new race resets opponent territory, selection and overview without reading or writing solo storage',()=>{
 const h=raceHarness();h.run('focusRaceTerritory("rival");map3d.onRivalSelect("iron");rival.state.time=99;state=E.create();render()');
 assert.equal(h.run('territory'),'both');assert.equal(h.run('rivalSelection'),null);assert.equal(h.run('rival.state.time'),0);assert(h.run('map3d.rival===rival.state'));assert(h.get('raceObject').hidden);
 // The runtime has no storage API. This is also guaranteed by the generated page's practice flag.
 const source=fs.readFileSync(path.join(__dirname,'../dist/bot-race.js'),'utf8');assert(!/localStorage|sessionStorage/.test(source));
});
