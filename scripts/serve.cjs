const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const publicDir = path.resolve(__dirname, '../public');
const file = path.join(publicDir, 'index.html');
if (!fs.existsSync(file)) throw new Error('Run npm run build first.');
const port = Number(process.env.PORT || 4186);
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;
  if (pathname === '/pvp' || pathname.startsWith('/pvp/')) {
    res.writeHead(302, {Location: 'https://pvp-testnet-testnet.up.railway.app' + pathname + url.search}); res.end(); return;
  }
  const files = {'/': ['index.html', 'text/html; charset=utf-8'], '/index.html': ['index.html', 'text/html; charset=utf-8'], '/playable-game.json': ['playable-game.json', 'application/json; charset=utf-8']};
  const target = files[pathname];
  if (!target || !fs.existsSync(path.join(publicDir, target[0]))) {
    res.writeHead(404); res.end('Not found'); return;
  }
  res.writeHead(200, {'Content-Type': target[1], 'Cache-Control': 'no-store'});
  fs.createReadStream(path.join(publicDir, target[0])).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`Open http://127.0.0.1:${port}`));
