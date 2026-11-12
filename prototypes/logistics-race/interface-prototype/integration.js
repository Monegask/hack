/* Embeds the EN game and routes the public Testnet release to its server. */
(()=>{'use strict';
 if(document.body.dataset.testnetPvp==='true'){
  document.addEventListener('click',event=>{
   const action=event.target.closest('[data-action]')?.dataset.action;
   if(['online','matches','wallet','create','join','prefund'].includes(action)){
    event.preventDefault();event.stopImmediatePropagation();location.assign('/pvp/');
   }
  },true);
  window.SupplyLineUI.home();
 }
 const gameData=document.getElementById('playableGame');
 let gameHtml=gameData.textContent.trim()?JSON.parse(gameData.textContent):null,gameRequest=null;
 const loadGame=()=>gameHtml?Promise.resolve(gameHtml):(gameRequest||=fetch(gameData.dataset.src).then(response=>{if(!response.ok)throw Error('Game download failed');return response.json();}).then(html=>{gameHtml=html;return html;}).catch(error=>{gameRequest=null;throw error;}));
 let stage=null,frame=null;
 function closeGame({home=true}={}){
  if(frame){frame.srcdoc='';stage.remove();frame=null;stage=null;}
  document.body.classList.remove('playing');
  if(home)window.SupplyLineUI.home();
 }
 async function launch(mode,{history=true}={}){
  if(!['training','race'].includes(mode))return;
  closeGame({home:false});
  stage=document.createElement('section');stage.id='playableStage';stage.setAttribute('aria-label',mode==='training'?'Tutorial':'Bot race');
  const loading=document.createElement('div');loading.id='gameLoading';loading.setAttribute('role','status');loading.textContent='Loading '+(mode==='training'?'tutorial':'bot race')+'…';
  frame=document.createElement('iframe');frame.id='playableFrame';frame.title='Supply Line · '+(mode==='training'?'Tutorial':'Bot race');
  stage.append(frame,loading);document.body.append(stage);document.body.classList.add('playing');
  const config='<script>window.__supplyLineMode='+JSON.stringify(mode)+';window.__supplyLineEmbedded=true;<\/script>';
  const currentFrame=frame;
  try{const html=await loadGame();if(frame!==currentFrame)return;currentFrame.addEventListener('load',()=>{loading.hidden=true;},{once:true});currentFrame.srcdoc=html.replace('</head>',()=>config+'</head>');}
  catch{if(frame===currentFrame){loading.hidden=false;loading.textContent='Unable to download the game. Return to the menu and try again.';}return;}
  if(history)window.history.pushState({supplyLineMode:mode},'', '#'+mode);
  frame.focus();
 }
 window.SupplyLineIntegration={launch};
 window.addEventListener('message',event=>{
  if(!frame||event.source!==frame.contentWindow)return;
  if(event.data?.type==='supply-line-home'){closeGame();window.history.pushState({},'',location.pathname+location.search);}
  if(event.data?.type==='supply-line-mode')launch(event.data.mode);
 });
 window.addEventListener('popstate',()=>{const mode=location.hash.slice(1);if(['training','race'].includes(mode))launch(mode,{history:false});else closeGame();});
 if(['#training','#race'].includes(location.hash))launch(location.hash.slice(1),{history:false});
})();
