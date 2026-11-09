// One portable file: shared embedded assets, separate tutorial and bot sessions.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.resolve(root,'../../exports/logistics-game.html');
const script=code=>'<script>'+code.replaceAll('</script','<\\/script')+'</script>';
const boot=script(`
const shareMode=location.hash==='#race'?'race':'training';
document.body.dataset.practice='true';
if(shareMode==='training'){delete document.body.dataset.race;document.body.dataset.training='true';}
document.title='Линия снабжения · '+(shareMode==='race'?'игра против бота':'обучение');
`);
const menu=`<style>
#shareMenu{box-sizing:border-box;max-width:min(490px,calc(100vw - 28px));padding:28px;border:1px solid #bd8655;border-radius:18px;background:#1e303b;color:#e7e7d9;font:16px/1.5 Arial,sans-serif;box-shadow:0 20px 80px #0008}
#shareMenu::backdrop{background:#08141ee8}#shareMenu h1{font-size:26px;margin:0 0 12px}#shareMenu p{color:#c6d0d1;margin:0 0 20px}#shareMenu button{display:block;width:100%;margin-top:10px;padding:14px;border:1px solid #bd8655;border-radius:9px;font:600 16px Arial,sans-serif;cursor:pointer;background:#d0945b;color:#14242d}#shareMenu button+button{background:#293e49;color:#e7e7d9}#shareMenu small{display:block;color:#aab9bd;margin-top:18px}
</style><dialog id="shareMenu" aria-labelledby="shareTitle"><h1 id="shareTitle">Линия снабжения</h1><p>Построй производство и первым доставь в хаб 12 железа, 6 меди и 8 асфальта.</p><button type="button" data-share-mode="training">Пройти обучение</button><button type="button" data-share-mode="race">Играть против бота</button><small>Всё в одном файле. Интернет и установка не нужны.</small></dialog>`;
const navigation=script(`
function shareGo(mode){location.hash=mode;location.reload();}
const shareMenu=document.getElementById('shareMenu');
shareMenu.addEventListener('cancel',e=>e.preventDefault());
for(const button of shareMenu.querySelectorAll('[data-share-mode]'))button.onclick=()=>shareGo(button.dataset.shareMode);
const shareHome=document.createElement('button');shareHome.type='button';shareHome.id='shareHome';shareHome.textContent='Главное меню';shareHome.onclick=()=>{state.paused=true;render();shareMenu.showModal();};document.querySelector('.map-top .controls').append(shareHome);
if(shareMode==='training')document.querySelector('.prototype-note').textContent='Учебная партия. Соперник не действует. После обучения можно перейти к гонке с ботом в этом же файле.';
document.addEventListener('click',e=>{const a=e.target.closest('a[href]');if(!a)return;const href=a.getAttribute('href');let mode;if(/(?:logistics-race-tutorial|game-3d-tutorial)\\.html/.test(href))mode='training';else if(/(?:logistics-race-bot|bot-race)\\.html/.test(href))mode='race';if(mode){e.preventDefault();setTimeout(()=>shareGo(mode),0);}});
if(!['#training','#race'].includes(location.hash))shareMenu.showModal();
`);
let html=fs.readFileSync(path.join(root,'logistics-race-bot.html'),'utf8');
const bot=fs.readFileSync(path.join(root,'dist/bot-race.js'),'utf8');
const marker='<script>'+bot+'</script>';
if(!html.includes(marker))throw Error('Missing bot adapter in offline source');
html=html.replace(marker,script('if(document.body.dataset.race===\'true\'){const adapter=document.createElement(\'script\');adapter.textContent='+JSON.stringify(bot)+';document.body.append(adapter);}'));
html=html.replace(/<script>/,boot+'<script>').replace('</body>',menu+navigation+'</body>');
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,html);
console.log(JSON.stringify({file:out,bytes:Buffer.byteLength(html),modes:['training','race'],singleFile:true}));
