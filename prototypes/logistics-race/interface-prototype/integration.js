/* Uses the existing EN game. Online remains a separate local demonstration. */
(()=>{'use strict';
 const gameHtml=JSON.parse(document.getElementById('playableGame').textContent);
 let stage=null,frame=null;
 function closeGame({home=true}={}){
  if(frame){frame.srcdoc='';stage.remove();frame=null;stage=null;}
  document.body.classList.remove('playing');
  if(home)window.SupplyLineUI.home();
 }
 function launch(mode,{history=true}={}){
  if(!['training','race'].includes(mode))return;
  closeGame({home:false});
  stage=document.createElement('section');stage.id='playableStage';stage.setAttribute('aria-label',mode==='training'?'Tutorial':'Bot race');
  const loading=document.createElement('div');loading.id='gameLoading';loading.setAttribute('role','status');loading.textContent='Loading '+(mode==='training'?'tutorial':'bot race')+'…';
  frame=document.createElement('iframe');frame.id='playableFrame';frame.title='Supply Line · '+(mode==='training'?'Tutorial':'Bot race');
  frame.addEventListener('load',()=>{loading.hidden=true;},{once:true});
  stage.append(frame,loading);document.body.append(stage);document.body.classList.add('playing');
  const config='<script>window.__supplyLineMode='+JSON.stringify(mode)+';window.__supplyLineEmbedded=true;<\/script>';
  frame.srcdoc=gameHtml.replace('</head>',()=>config+'</head>');
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
