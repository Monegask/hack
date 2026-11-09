const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const file = path.resolve(__dirname, '../public/index.html');
if (!fs.existsSync(file)) throw new Error('Run npm run build first.');
const port = Number(process.env.PORT || 4186);
http.createServer((req, res) => {
  if (!['/', '/index.html'].includes(new URL(req.url, 'http://localhost').pathname)) {
    res.writeHead(404); res.end('Not found'); return;
  }
  res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store'});
  fs.createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`Open http://127.0.0.1:${port}`));
