import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
if(!process.env.AUDIT_PVP_ROOT)throw Error('Set AUDIT_PVP_ROOT to the reviewed local PR #3 pvp directory');
const url=name=>pathToFileURL(path.join(process.env.AUDIT_PVP_ROOT,name)).href;
const {fixture,playing}=await import(url('tests/fixture.mjs'));
const {createApp}=await import(url('server/http.mjs'));
for(const condition of ['server-frozen','absolute-deadline'])test(`EXPOSURE R07: v2 ${condition} refund is hidden behind legacy heartbeat gate`,async t=>{
 const f=fixture();t.after(()=>f.store.close());const m=await playing(f),c=f.chain.matches.get(m.chainId);
 // v2 permits these refunds despite a fresh last_heartbeat_ns. Mainnet remains
 // disabled; this tests compatibility through the still-supported Testnet adapter.
 if(condition==='server-frozen')f.chain.chainConfig.server_frozen=true;
 else c.game_deadline_ns=String(BigInt(f.now()-1)*1000000n);
 const app=createApp(f.cfg,f.store,f.chain,f.game);await new Promise(r=>app.listen(0,'127.0.0.1',r));
 t.after(()=>new Promise(r=>{app.closeAllConnections();app.close(r);}));
 f.cfg.origin=`http://127.0.0.1:${app.address().port}`;
 f.store.put('session',createHash('sha256').update('audit').digest('hex'),{account:'alice.testnet',csrf:'audit',scope:f.cfg.scope,expires:Date.now()+60000});
 const r=await fetch(f.cfg.origin+`/api/matches/${m.code}/transaction`,{method:'POST',headers:{origin:f.cfg.origin,cookie:'sl_session=audit','x-csrf-token':'audit','content-type':'application/json'},body:JSON.stringify({kind:'emergency'})});
 assert.equal(r.status,400);assert.match((await r.json()).error,/not available yet/);
});
