const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
process.env.SUPPLY_LINE_PVP_URL = '/pvp/';
for (const script of [
  'prototypes/logistics-race/game-3d/build.mjs',
  'prototypes/logistics-race/build-offline.cjs',
  'prototypes/logistics-race/bot/build-race.cjs',
  'prototypes/logistics-race/share/build-share.cjs',
  'prototypes/logistics-race/share/build-portal.cjs'
]) execFileSync(process.execPath, [script], {cwd: root, stdio: 'inherit'});
fs.mkdirSync(path.join(root, 'public'), {recursive: true});
fs.copyFileSync(path.join(root, 'exports/supply-line.html'), path.join(root, 'public/index.html'));
console.log('Published build: public/index.html');
