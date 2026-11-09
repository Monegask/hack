const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'dist');
function race(html,offline){
 const scripts=['bot.js','bot-race.js'].map(name=>offline?'<script>'+fs.readFileSync(path.join(dist,name),'utf8')+'</script>':'<script src="'+name+'"></script>').join('');
 const worldScript=offline?'<script>'+fs.readFileSync(path.join(dist,'race-world.js'),'utf8')+'</script>':'<script src="race-world.js"></script>';
 html=offline?html.replace(/<script>[\s\S]*?<\/script>/,engine=>engine+worldScript):html.replace('<script src="engine.js"></script>',engine=>engine+worldScript);
 return html.replace('<body class="three-game">','<body class="three-game" data-practice="true" data-race="true">').replace('<title>Линия снабжения · 3D</title>','<title>Линия снабжения · гонка с ботом</title>').replace('Полная игровая карта · 3D','Гонка с ботом · средняя сложность').replace('</body>',scripts+'</body>');
}
function build(){
fs.writeFileSync(path.join(dist,'bot-race.html'),race(fs.readFileSync(path.join(dist,'game-3d.html'),'utf8'),false));
fs.writeFileSync(path.join(root,'logistics-race-bot.html'),race(fs.readFileSync(path.join(root,'logistics-race-game-3d.html'),'utf8'),true));
console.log('Built dist/bot-race.html and logistics-race-bot.html');
}
module.exports={race,build};if(require.main===module)build();
