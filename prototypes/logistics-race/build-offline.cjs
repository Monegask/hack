const fs=require('node:fs'),path=require('node:path');
const base=path.join(__dirname,'dist');
let html=fs.readFileSync(path.join(base,'index.html'),'utf8');
html=html.replace(/<link[^>]*href="style.css"[^>]*>/,'<style>'+fs.readFileSync(path.join(base,'style.css'),'utf8')+'</style>');
for(const file of ['engine.js','map-scene.js','app.js']){
 let script=fs.readFileSync(path.join(base,file),'utf8');
 for(const asset of fs.readdirSync(path.join(base,'assets')).filter(file=>file.endsWith('.png')))script=script.replaceAll('assets/'+asset,'data:image/png;base64,'+fs.readFileSync(path.join(base,'assets',asset)).toString('base64'));
 html=html.replace(new RegExp('<script src="'+file.replace('.','\\.')+'"></script>'),()=>'<script>'+script+'</script>');
}
const out=path.join(__dirname,'logistics-race-offline.html');fs.writeFileSync(out,html);console.log(out);
function demo(source){return source.replace('<body>','<body data-demo="true">').replace('Логистическая гонка · рабочее название','Демонстрация анимации · отдельная партия').replace('Экономический прототип · без соперника, авиации и NEAR. Все месторождения разведаны. Сохранение — в этом браузере.','Демонстрационная партия с готовыми дорогами. Нажмите «Продолжить». Основное сохранение не используется.').replace('Текущая партия и её сохранение будут заменены.','Демонстрационная партия начнётся сначала. Основное сохранение не изменится.');}
fs.writeFileSync(path.join(base,'animation-demo.html'),demo(fs.readFileSync(path.join(base,'index.html'),'utf8')));
fs.writeFileSync(path.join(__dirname,'logistics-race-animation-demo.html'),demo(html));
