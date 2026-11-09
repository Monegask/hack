const {test}=require('node:test'),assert=require('node:assert/strict'),E=require('../dist/engine.js');
function run(s,n){for(let i=0;i<n*10;i++)E.tick(s,.1);}
test('Custom pipe only delivers after both ends are connected; exact cost and no tanker',()=>{
 const s=E.create();s.paused=false;s.enabled.oil=false;s.enabled.refinery=false;s.sites.oil2.active=true;
 run(s,11);assert.equal(s.sites.oil2.stock,2);
 assert(!E.start(s,1,'haul','oil2'));assert(!E.buildPipeCell(s,[5,5]));assert(!E.buildPipeCell(s,[12,2]));
 assert(E.buildPipeCell(s,[9,9]));assert(E.buildPipeCell(s,[8,9]));run(s,6);assert.equal(s.city.oil,0);
 for(const p of [[4,8],[5,8],[6,8],[7,8],[8,8]])assert(E.buildPipeCell(s,p));
 assert(E.pipeConnected(s));assert.equal(s.city.iron,3.5);assert(!E.buildPipeCell(s,[8,8]));
 run(s,6);assert.equal(s.city.oil,1);s.enabled.refinery=true;run(s,10);assert(s.stats.produced>=2);
});
test('Longer pipe costs per placed cell and retains partial construction on reload',()=>{
 const s=E.create();s.paused=false;s.city.iron=3;assert(E.buildPipeCell(s,[3,9]));
 const restored=E.upgrade(JSON.parse(JSON.stringify(s)));assert(E.buildPipeCell(restored,[3,10]));
 assert(!E.buildPipeCell(restored,[4,10]));assert.equal(restored.city.iron,0);assert.equal(restored.pipeCells.length,2);assert(!E.pipeConnected(restored));
});
test('Old paid pipeline migrates without charging or breaking supply',()=>{
 const s=E.create();delete s.pipeCells;s.oilPipe={points:[[3,8],[4,8],[5,8],[6,8],[7,8],[8,8],[9,8],[9,9]],left:3};
 const fuel=s.fuel,iron=s.city.iron;E.upgrade(s);assert(E.pipeConnected(s));assert.equal(s.city.iron,iron);assert.equal(s.fuel,fuel);assert.equal(s.oilPipe.left,3);
});

test('Diagonal pipe connects to the refinery and persists at the same per-cell price',()=>{
 const s=E.create();s.paused=false;s.enabled.oil=false;s.enabled.refinery=false;s.sites.oil2.active=true;s.sites.oil2.enabled=false;s.sites.oil2.stock=2;
 for(const p of [[4,9],[5,9],[6,9],[7,9],[8,9],[9,9]])assert(E.buildPipeCell(s,p));
 assert(E.pipeConnected(s));assert.equal(s.city.iron,5);
 assert(E.pipeEdges(s).some(([a,b])=>Math.abs(a[0]-b[0])===1&&Math.abs(a[1]-b[1])===1));
 const restored=E.upgrade(JSON.parse(JSON.stringify(s)));assert(E.pipeConnected(restored));run(restored,5.1);assert.equal(restored.city.oil,1);
});
test('Diagonal pipe neither builds nor renders through a blocked mountain corner',()=>{
 const s=E.create();s.paused=false;s.pipeCells=['4,5'];const iron=s.city.iron;
 assert(!E.canPipeStep([4,5],[5,6]));assert(!E.buildPipeCell(s,[5,6]));assert.equal(s.city.iron,iron);
 s.pipeCells.push('5,6');assert(!E.pipeEdges(s).some(([a,b])=>[a.join(','),b.join(',')].sort().join('|')==='4,5|5,6'));
 for(const [a,b] of E.pipeEdges(s))assert(E.canPipeStep(a,b));
});

test('Authoritative pipe edges deduplicate older saves containing the initial service cells',()=>{
 const s=E.create();s.pipeCells=['1,8','2,8','2,8'];const edges=E.pipeEdges(s);
 assert.equal(edges.length,2);assert.equal(new Set(edges.map(([a,b])=>[a.join(','),b.join(',')].sort().join('|'))).size,edges.length);
});
