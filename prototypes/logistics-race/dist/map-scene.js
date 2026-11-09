(function(root){
'use strict';
const E=typeof module!=='undefined'?require('./engine.js'):root.Logistics;
const xy=p=>[54+p[0]*56,44+p[1]*54],key=p=>p.join(',');
const models={oil:{at:[75,468],size:112},oil2:{at:[585,535],size:112},iron:{src:'assets/map-ore-mine.png',at:[100,340],size:112},copper:{src:'assets/map-ore-mine.png',at:[470,445],size:112},gravel:{src:'assets/map-gravel-quarry.png',at:[245,265],size:122},asphalt:{src:'assets/map-asphalt.png',at:[345,445],size:112}};
const cityModels=[['НПЗ','assets/map-refinery.png'],['Металлургия','assets/map-metalworks.png'],['Сборка машин','assets/map-assembly.png']];
const line=(a,b,style)=>`<path d="M${a}L${b}" fill="none" ${style}/>`;
const image=(src,size,x=0)=>`<image class="map-model" href="${src}" x="${x-size/2}" y="${24-size}" width="${size}" height="${size}"/>`;
function pump(id){return `<g class="pump-model" data-pump="${id}">
 <path d="M-52 16L5 -1L57 19L2 39Z" fill="#d9d3bf"/><path d="M-45 22L1 6L49 22L4 36Z" fill="#f0e8d8" stroke="#777269" stroke-width=".7"/>
 <path d="M-17 20L-3 -48L5 -48L24 20L14 24L0 -27L-7 24Z" fill="#e9deca" stroke="#5e5c55" stroke-width="1.3"/>
 <path d="M5 -48L12 -45L32 16L24 20Z" fill="#b9b19f"/><path d="M-8 -5L16 -5M-11 7L20 7" stroke="#8d8678" stroke-width="3"/>
 <path d="M23 2L41 -4L53 2V21L35 27L23 21Z" fill="#d7cab4" stroke="#5d5b54"/><path d="M23 2L35 8L53 2M35 8V27" fill="none" stroke="#a49a89"/><path d="M30 -2L40 -5L48 -1L38 3Z" fill="#c45f47"/>
 <g data-crank="${id}"><circle cx="28" cy="1" r="13" fill="#363834" stroke="#1e211f"/><circle cx="28" cy="1" r="8" fill="none" stroke="#79786c" stroke-width="2"/><path d="M28 -10V12M17 1H39" stroke="#9c9585" stroke-width="2"/></g>
 <path data-link="${id}" d="M29 -43L28 1" stroke="#b8ad98" stroke-width="5"/><path d="M-46 23L-36 19L-28 23V31L-38 35L-46 31Z" fill="#d1c5ae" stroke="#686457"/>
 <path data-rod="${id}" d="M-39 -59V26" fill="none" stroke="#4c4e48" stroke-width="2.5"/>
 <g data-beam="${id}"><path d="M-40 -64L33 -46L32 -39L-41 -56Z" fill="#393b36" stroke="#222521"/><path d="M-39 -64L-35 -68L36 -50L33 -46Z" fill="#74736a"/>
 <path d="M-43 -77Q-57 -63 -48 -44L-37 -48L-35 -70Z" fill="#c56047" stroke="#6d3f32" stroke-width="1"/><path d="M-43 -77L-38 -79L-31 -72L-35 -70Z" fill="#df896b"/></g>
 <circle cx="0" cy="-48" r="5" fill="#dfd4c0" stroke="#55594e" stroke-width="2"/><path d="M-38 29L-49 35L-55 33" fill="none" stroke="#585c51" stroke-width="3"/>
 </g>`;}
function warehouse(){return `<g stroke="#55574e" stroke-width="1"><path d="M-41 -19L11 -34L44 -16L-8 0Z" fill="#f6efdf"/><path d="M-41 -19L-8 0V31L-41 12Z" fill="#c8c0af"/><path d="M-8 0L44 -16V15L-8 31Z" fill="#e6decd"/><path d="M0 7L14 3V24L0 28ZM23 0L37 -4V17L23 21Z" fill="#373c36"/><path d="M-6 0L44 -15" stroke="#bd5d47" stroke-width="3"/><path d="M-20 -20L-9 -23L-2 -19L-13 -16Z" fill="#aaa394"/></g>`;}
function site(s,id,selected){
 const [ax,ay]=xy(E.positions[id]),m=models[id],active=!s.sites[id]||s.sites[id].active,[x,y]=m?.at||(id==='city'?[222,564]:id==='center'?[ax,ay-32]:[ax,ay]);
 const size=id==='city'?258:m?.size||92;
 const [labelX,labelY]=id==='gravel'?[0,-125]:id==='copper'?[150,-10]:id==='asphalt'?[80,90]:id==='center'?[130,0]:[0,id==='city'?66:48];
 const hitLeft=Math.min(-size/2,labelX-72),hitTop=Math.min(active?24-size:-30,labelY-24),hitRight=Math.max(size/2,labelX+72),hitBottom=Math.max(25,labelY+19);
 let art=id==='city'?cityModels.map(([name,src],i)=>`${image(src,82,(i-1)*86)}<text class="map-small campus-label" x="${(i-1)*86}" y="37" text-anchor="middle">${name}</text>`).join(''):id==='center'?warehouse():!active?'<path d="M-28 4L0 -10L28 4L0 18Z" fill="#e4ddcc" stroke="#888273" stroke-dasharray="4 3"/><path d="M-15 1v-15h12V1M6 4v-10h12V4" fill="#f5ecdb" stroke="#a49a87"/><path d="M-25 12L-15 17M15 -5L25 0" stroke="#c46149" stroke-width="3"/>':id==='oil'||id==='oil2'?pump(id):image(m.src,size);
 const status=id==='city'?'ПРОМЫШЛЕННЫЙ КОМПЛЕКС':id==='center'?'12 Fe · 6 Cu · 8 асфальта':E.siteStatus(s,id);
 return `<g class="node ${selected===id?'selected-node':''}" data-node="${id}" data-built="${active}" tabindex="0" role="button" aria-label="${E.label(id)}"><title>${E.label(id)} · ${status}</title><g transform="translate(${x},${y})"><rect class="node-hit" x="${hitLeft}" y="${hitTop}" width="${hitRight-hitLeft}" height="${hitBottom-hitTop}" rx="8"/><ellipse class="node-ring" cy="12" rx="${id==='city'?130:active?size*.45:32}" ry="17" stroke-dasharray="${active?'':'3 4'}"/>${art}<rect class="map-caption" x="${labelX-72}" y="${labelY-24}" width="144" height="43" rx="4" fill="#f5eedf" fill-opacity=".88" pointer-events="none"/><text class="map-label" text-anchor="middle" x="${labelX}" y="${labelY}">${E.label(id)}</text><text class="map-small site-status" text-anchor="middle" x="${labelX}" y="${labelY+14}">${status}</text><text class="map-stock" id="stock-${id}" text-anchor="middle" x="${labelX}" y="${labelY-15}"></text></g></g>`;
}
function terrain(s,{selected='iron',roadMode=false,pipeMode=false}={}){
 let out='<defs><pattern id="field-hatch" width="24" height="10" patternUnits="userSpaceOnUse"><path d="M2 5h9m4 0h5" stroke="#d6cdb9" stroke-width=".5"/></pattern></defs><rect width="960" height="660" fill="#f5eedf"/>';
 out+='<path d="M25 195H300L337 224H600L650 176H924V413H770L725 460H640L620 585H40V510H15Z" fill="#e4e0cc"/><path d="M45 190H290L317 216H586L636 166H924V245H700L665 280H330L304 260H45Z" fill="url(#field-hatch)"/>';
 // The service aprons are decorative, not paid roads. Mission endpoints are their gates.
 for(const [id,p] of Object.entries(E.positions)){
  const a=xy(p),b=models[id]?.at||(id==='city'?[222,564]:id==='center'?[a[0],a[1]-32]:a),isCity=id==='city';
  out+=`<path d="M${a}L${b[0]} ${b[1]+12}" fill="none" stroke="#f8f2e5" stroke-width="${isCity?28:19}" stroke-linecap="round"/><path d="M${a}L${b[0]} ${b[1]+12}" fill="none" stroke="${isCity?'#b8b5a4':'#d0c7b2'}" stroke-width="${isCity?19:10}" stroke-linecap="round"/>`;
  out+=`<path d="M${b[0]-42} ${b[1]+3}l46 -22 50 23 -46 23Z" fill="#d8d5c2" stroke="#f7f0e3" stroke-width="2"/>`;
 }
 out+='<path d="M92 567L222 510L352 568L222 613Z" fill="#d8d5c2" stroke="#f7f0e3" stroke-width="2"/>';
 out+='<g id="dirt-tracks" pointer-events="none"></g>';
 // Paid roads use exactly the same connected edges as the routing engine.
 const cells=[E.positions.city,...s.roads.map(k=>k.split(',').map(Number))],set=new Set(cells.map(key)),edges=[];
 for(const p of cells)for(const [dx,dy] of E.directions){const q=[p[0]+dx,p[1]+dy];if(set.has(key(q))&&key(p)<key(q)&&E.canStep(p,q))edges.push([xy(p),xy(q)]);}
 for(const [a,b] of edges)out+=line(a,b,'stroke="#fcf5e7" stroke-width="28" stroke-linecap="round"');
 for(const p of s.roads.map(k=>k.split(',').map(Number))){const [x,y]=xy(p);out+=`<circle cx="${x}" cy="${y}" r="11" fill="#343833"/>`;}
 for(const [a,b] of edges)out+=line(a,b,'class="paved-road" stroke="#343833" stroke-width="22" stroke-linecap="round"');
 for(const [a,b] of edges)out+=line(a,b,'stroke="#eee6d4" stroke-width="1" stroke-dasharray="8 7"');
 const a=xy(E.positions.oil),b=xy(E.positions.city);out+=line([a[0],a[1]+17],[b[0],b[1]+17],'stroke="#5f6157" stroke-width="5"')+line([a[0],a[1]+17],[b[0],b[1]+17],'stroke="#d7ccba" stroke-width="1"');
 for(const cell of s.pipeCells){const p=cell.split(',').map(Number);for(const [dx,dy] of E.pipeDirections){const q=[p[0]+dx,p[1]+dy];if(E.onPipe(s,q))out+=line(xy(p),xy(q),'stroke="#7d7463" stroke-width="5"')+line(xy(p),xy(q),'stroke="#e8d6b5" stroke-width="1.5" stroke-dasharray="5 4"');}}
 // Small planar vegetation marks, kept away from every travel cell centre.
 for(let i=0;i<58;i++){const x=32+(i*137)%885,y=185+(i*71)%400;if(Object.values(models).some(m=>Math.hypot(x-m.at[0],y-m.at[1])<64)||Math.abs((x-54)%56)<16||Math.abs((y-44)%54)<16)continue;out+=`<g pointer-events="none" transform="translate(${x},${y})"><path d="M-5 2q-4 -8 3 -11q-4 8 2 9q-1 -6 4 -6q-3 5 1 8Z" fill="${i%9===0?'#b75b43':'#8e907c'}"/></g>`;}
 const route=E.routeInfo(s,selected);out+=`<polyline class="route-focus" points="${route.points.map(p=>xy(p).join(',')).join(' ')}" fill="none" stroke="#be6748" stroke-width="1.6" stroke-dasharray="4 6" opacity=".6" pointer-events="none"/>`;
 for(const p of [...E.mountains].sort((a,b)=>a[1]-b[1])){const [x,y]=xy(p),h=21+(p[0]*7+p[1]*11)%22;out+=`<g class="mountain" pointer-events="none"><path d="M${x-28} ${y+17}L${x-20} ${y-5}L${x-8} ${y-h}L${x+3} ${y-h-7}L${x+16} ${y-10}L${x+28} ${y+16}L${x+3} ${y+27}Z" fill="#ded3be" stroke="#797568" stroke-width=".7"/><path d="M${x+3} ${y-h-7}L${x+16} ${y-10}L${x+28} ${y+16}L${x+3} ${y+27}L${x-3} ${y-3}Z" fill="#8a887c"/><path d="M${x-28} ${y+17}L${x-20} ${y-5}L${x-8} ${y-h}L${x+3} ${y-h-7}L${x-10} ${y-3}L${x-14} ${y+10}Z" fill="#f6edda"/><path d="M${x-10} ${y-3}L${x+3} ${y+27}L${x-14} ${y+10}Z" fill="#c0b8a7"/></g>`;}
 for(const [id] of Object.entries(E.positions).sort(([a],[b])=>(models[a]?.at[1]||xy(E.positions[a])[1])-(models[b]?.at[1]||xy(E.positions[b])[1])))out+=site(s,id,selected);
 if(roadMode||pipeMode)for(let x=0;x<16;x++)for(let y=0;y<11;y++){const [px,py]=xy([x,y]);out+=`<rect class="road-cell" x="${px-27}" y="${py-26}" width="54" height="52" fill="transparent" stroke="#988c73" stroke-width=".5"/>`;}
 return out+'<g id="vehicles" pointer-events="none"></g>';
}
function pumpPose(phase){
 const angle=Math.sin(phase)*13,r=angle*Math.PI/180;
 const point=(x,y)=>[x*Math.cos(r)-(y+48)*Math.sin(r),-48+x*Math.sin(r)+(y+48)*Math.cos(r)];
 const rod=point(-45,-57),beam=point(30,-43),pin=[28+10*Math.cos(phase),1+10*Math.sin(phase)];
 return {angle,crank:phase*180/Math.PI,rod,beam,pin};
}
function cycle(s,id){return id==='oil'?s.production.oil:s.sites[id]?.active?s.sites[id].mining:null;}
function updateClocks(s,cache={},extra=0){
 const now=s.time+(s.paused||s.won?0:extra);if(cache.time!==undefined&&now<cache.time-.5){cache.time=now;cache.oil=0;cache.oil2=0;}const delta=cache.time===undefined?0:Math.max(0,now-cache.time);cache.time=now;
 for(const id of ['oil','oil2']){cache[id]??=0;if(cycle(s,id)&&!s.paused&&!s.won)cache[id]+=delta*2.3;}
 return cache;
}
function truckPose(s,t,extra=0,lastAngle=0){
 let position=t.position||E.positions.city,angle=lastAngle,distance=0,moving=false;
 if(t.leg){let elapsed=t.leg.elapsed+(s.paused||s.won?0:extra),i=0;while(i<t.leg.costs.length-1&&elapsed>=t.leg.costs[i]){elapsed-=t.leg.costs[i];distance+=Math.hypot(...t.leg.points[i+1].map((v,k)=>v-t.leg.points[i][k]));i++;}
  const a=t.leg.points[i],b=t.leg.points[i+1],u=Math.min(1,elapsed/t.leg.costs[i]);position=a.map((v,k)=>v+(b[k]-v)*u);const pa=xy(a),pb=xy(b);angle=Math.atan2(pb[1]-pa[1],pb[0]-pa[0]);distance+=Math.hypot(b[0]-a[0],b[1]-a[1])*u;moving=!s.paused&&!s.won;
 }
 let [x,y]=xy(position);
 // Right-hand lane, also separates outgoing and returning traffic. Same offset on dirt.
 if(t.leg){x-=Math.sin(angle)*5.5;y+=Math.cos(angle)*5.5;}else if(!t.job){x+=(t.id-1)*17-9;y-=4;}
 return {x,y,angle,distance,moving};
}
const n=v=>Number(v.toFixed(2));
function truck(p,id,selected){
 const c=Math.cos(p.angle),s=Math.sin(p.angle),P=(l,w,z=0)=>[n(c*l-s*w),n(s*l+c*w-z)];
 const poly=(pts,fill)=>`<polygon points="${pts.map(p=>p.join(',')).join(' ')}" fill="${fill}" stroke="#363a34" stroke-width=".65" stroke-linejoin="round"/>`;
 function box(a,b,w,z,h,top,side){
  let out='';if(s>0)out+=poly([P(b,-w,z),P(b,w,z),P(b,w,h),P(b,-w,h)],side);else out+=poly([P(a,-w,z),P(a,w,z),P(a,w,h),P(a,-w,h)],side);
  const v=c>0?w:-w;out+=poly([P(a,v,z),P(b,v,z),P(b,v,h),P(a,v,h)],side);
  return out+poly([P(a,-w,h),P(b,-w,h),P(b,w,h),P(a,w,h)],top);
 }
 function wheels(side){return [-10,-3,10].map(l=>{const [x,y]=P(l,side*5.5,3),rx=Math.max(1.1,Math.abs(c)*2.7),phase=p.distance*27;
 return `<ellipse cx="${x}" cy="${y}" rx="${n(rx)}" ry="3" fill="#2b302c" stroke="#171c18" stroke-width=".7"/><ellipse cx="${x}" cy="${y}" rx="${n(rx*.52)}" ry="1.7" fill="#a49c8b"/><path d="M${n(x-Math.cos(phase)*rx*.5)} ${n(y-Math.sin(phase)*1.6)}L${n(x+Math.cos(phase)*rx*.5)} ${n(y+Math.sin(phase)*1.6)}" stroke="#474c43" stroke-width=".7"/>`;}).join('');}
 const near=c>=0?1:-1;
 let art=poly([P(-18,-7),P(15,-7),P(19,7),P(-14,7)],'#d2c8b4');
 if(selected)art+=`<ellipse cx="0" cy="1" rx="22" ry="10" fill="none" stroke="#ba6348" stroke-width="1.4"/>`;
 art+=wheels(-near)+box(-15,15,4.7,2,4,'#686b60','#353b33');
 const cargo=()=>box(-14,3,4.6,4,11,'#f6edda','#c8beaa'),cab=()=>box(4,15,4.6,4,10,'#eee3cd','#d2c6af');art+=s>=0?cargo()+cab():cab()+cargo();
 const side=near*4.7;art+=poly([P(-13,side,8),P(2,side,8),P(2,side,9.5),P(-13,side,9.5)],'#bf6047');
 art+=poly([P(5,side,7),P(12,side,7),P(12,side,9.4),P(5,side,9.4)],'#414b46');
 if(s>0)art+=poly([P(15,-3.8,7),P(15,3.8,7),P(15,3.8,9.5),P(15,-3.8,9.5)],'#3e4944');
 art+=wheels(near);
 return `<g class="map-truck" data-truck-map="${id}" data-heading="${n(p.angle)}" data-moving="${p.moving}" transform="translate(${n(p.x)},${n(p.y)})">${art}<text x="0" y="-19" text-anchor="middle" class="truck-map-number">${id}</text></g>`;
}
function update(svg,s,{selectedTruck=1,extra=0,clocks={},headings={}}={}){
 updateClocks(s,clocks,extra);
 const tracks=svg.querySelector('#dirt-tracks');if(tracks){const edges=new Map(),paved=p=>key(p)===key(E.positions.city)||s.roads.includes(key(p));for(const t of s.trucks)if(t.leg)for(let i=1;i<t.leg.points.length;i++){const a=t.leg.points[i-1],b=t.leg.points[i];if(paved(a)&&paved(b))continue;edges.set([key(a),key(b)].sort().join('|'),[xy(a),xy(b)]);}tracks.innerHTML=[...edges.values()].map(([a,b])=>line(a,b,'stroke="#cfc1a7" stroke-width="17" stroke-linecap="round"')+line(a,b,'stroke="#e5d9c1" stroke-width="9" stroke-linecap="round"')).join('');}
 for(const id of ['oil','oil2']){const p=pumpPose(clocks[id]),beam=svg.querySelector(`[data-beam="${id}"]`);if(!beam)continue;
  beam.setAttribute('transform',`rotate(${p.angle} 0 -48)`);svg.querySelector(`[data-crank="${id}"]`).setAttribute('transform',`rotate(${p.crank} 28 1)`);
  svg.querySelector(`[data-rod="${id}"]`).setAttribute('d',`M${p.rod}L${p.rod[0]} 26`);svg.querySelector(`[data-link="${id}"]`).setAttribute('d',`M${p.beam}L${p.pin}`);
 }
 const layer=svg.querySelector('#vehicles');if(layer)layer.innerHTML=s.trucks.map(t=>{const p=truckPose(s,t,extra,headings[t.id]||0);headings[t.id]=p.angle;return {t,p};}).sort((a,b)=>a.p.y-b.p.y).map(({t,p})=>truck(p,t.id,t.id===selectedTruck)).join('');
}
function demoState(){
 const s=E.create();s.time=60;s.paused=false;s.fuel=120;s.city.oil=12;s.city.asphalt=100;
 for(const site of Object.values(s.sites)){site.active=true;site.stock=20;}
 for(const id of ['gravel','copper','iron','center','oil2'])for(const p of E.path(s,E.positions.city,E.positions[id]))E.buildRoad(s,p);
 E.start(s,1,'haul','gravel');E.start(s,2,'haul','copper');E.tick(s,.1);s.paused=true;return s;
}
const api={xy,models,cityModels,site,terrain,pump,pumpPose,cycle,updateClocks,truckPose,truck,update,demoState};
if(typeof module!=='undefined')module.exports=api;root.MapScene=api;
})(typeof globalThis!=='undefined'?globalThis:this);
