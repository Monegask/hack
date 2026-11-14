const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const {spawn} = require('node:child_process');
const root = path.resolve(__dirname, '..');

test('Quick Start serves the lazy game payload and routes online play without exposing files', async () => {
  const probe = net.createServer();
  await new Promise(r => probe.listen(0, '127.0.0.1', r));
  const port = probe.address().port;
  await new Promise(r => probe.close(r));
  const child = spawn(process.execPath, ['scripts/serve.cjs'], {cwd: root, env: {...process.env, PORT: String(port)}, stdio: ['ignore', 'pipe', 'pipe']});
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Preview did not start')), 10000);
      child.stdout.once('data', () => {clearTimeout(timer); resolve();});
      child.once('error', reject);
      child.once('exit', code => {clearTimeout(timer); reject(Error('Preview exited: ' + code));});
    });
    const base = `http://127.0.0.1:${port}`;
    const page = await fetch(base);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /data-src="\/playable-game.json"/);
    const payload = await fetch(base + '/playable-game.json');
    assert.equal(payload.status, 200);
    assert.match(payload.headers.get('content-type'), /application\/json/);
    const game = await payload.json();
    assert.equal(typeof game, 'string');
    assert.match(game, /<html/);
    for (const route of ['/pvp', '/pvp/', '/pvp/invite-example', '/pvp/?invite=example']) {
      const response = await fetch(base + route, {redirect: 'manual'});
      assert.equal(response.status, 302);
      assert.equal(response.headers.get('location'), 'https://pvp-testnet-testnet.up.railway.app' + route);
    }
    for (const route of ['/package.json', '/.env', '/scripts/serve.cjs', '/pvp-attacker']) {
      assert.equal((await fetch(base + route)).status, 404);
    }
  } finally {
    child.kill();
    if (child.exitCode === null) await new Promise(r => child.once('exit', r));
  }
});

test('Submission documentation relative links resolve inside the repository', () => {
  for (const file of ['README.md', 'HACKATHON_DEMO.md', 'contracts/README.md', 'docs/REPOSITORY_VERIFICATION.md']) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
      const href = match[1];
      if (/^(https?:|#)/.test(href)) continue;
      const target = path.resolve(root, path.dirname(file), decodeURIComponent(href.split('#')[0]));
      assert.ok(target.startsWith(root + path.sep), `${file}: outside repository ${href}`);
      assert.ok(fs.existsSync(target), `${file}: missing ${href}`);
    }
  }
});
