import {gzipSync} from 'node:zlib';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {root,requirePayments} from './config.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
const cookie=(req,name)=>req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1);
const call=(receiverId,methodName,args,deposit='0',gas='150000000000000')=>({receiverId,actions:[{type:'FunctionCall',params:{methodName,args,deposit,gas}}]});
export function createApp(cfg,store,chain,service){
 const limits=new Map(),wireCache=new Map();let balanceCache=new Map();
 const server=http.createServer(async(req,res)=>{
  let status=200;const headers={...(cfg.scope?{'X-Supply-Line-Scope':cfg.scope}:{}),'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Cache-Control':'no-store','X-Frame-Options':'SAMEORIGIN'};
  const send=(value,code=200,extra={})=>{res.writeHead(code,{...headers,'Content-Type':'application/json',...extra});res.end(JSON.stringify(value));};
  const cookies=[];const setCookie=(name,value,maxAge)=>{cookies.push(`${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${cfg.origin.startsWith('https:')?'; Secure':''}`);};
  try{
   const url=new URL(req.url,cfg.origin),pathname=url.pathname;
   if(req.method!=='GET'&&req.method!=='POST')return send({error:'Method not allowed'},405);
   if(req.method==='POST'&&req.headers.origin!==cfg.origin) return send({error:'Origin rejected'},403);
   if(!pathname.startsWith('/api/')){
    if(req.method!=='GET')return send({error:'Not found'},404);
    if(pathname==='/healthz')return send({ok:true,network:cfg.network});
    if(pathname==='/pvp/game'){
     requirePayments(cfg);
     const raw=cookie(req,'sl_session'),session=raw&&store.get('session',hash(raw));if(!session||session.expires<Date.now()||(session.scope!==cfg.scope&&!(cfg.network==='testnet'&&!session.scope)))return send({error:'Connect your wallet first'},401);
     const snapshot=service.snapshot(url.searchParams.get('match'),session.account),file=path.join(root,'public/game.html');
     const config={code:snapshot.code,seed:snapshot.seed,side:snapshot.side,csrf:session.csrf};
     const html=fs.readFileSync(file,'utf8').replace('__PVP_CONFIG__',JSON.stringify(config).replaceAll('<','\\u003c'));
     res.writeHead(200,{...headers,'Content-Type':'text/html; charset=utf-8'});return res.end(html);
    }
    const files={'/':'index.html','/pvp':'index.html','/pvp/':'index.html','/pvp/app.js':'app.js','/pvp/style.css':'style.css'};
    const file=files[pathname];if(!file)return send({error:'Not found'},404);
    res.writeHead(200,{...headers,'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html; charset=utf-8'});return fs.createReadStream(path.join(root,'public',file)).pipe(res);
   }
   const ip=req.socket.remoteAddress||'unknown',now=Date.now(),rawSession=cookie(req,'sl_session'),rateSession=rawSession&&store.get('session',hash(rawSession)),rateKey=rateSession&&rateSession.expires>now?'session:'+hash(rawSession):'ip:'+ip,rate=limits.get(rateKey)||{at:now,n:0};if(now-rate.at>1000){rate.at=now;rate.n=0;}if(++rate.n>45)return send({error:'Too many requests'},429);limits.set(rateKey,rate);
   if(limits.size>2000)for(const [key,v] of limits)if(now-v.at>60000)limits.delete(key);
   let body={};if(req.method==='POST'){
    if(!req.headers['content-type']?.startsWith('application/json'))return send({error:'Expected JSON'},415);
    let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>8192)return send({error:'Request too large'},413);}body=JSON.parse(text||'{}');
   }
   if(pathname==='/api/config')return send({network:cfg.network,token:cfg.token,escrow:cfg.escrow,symbol:chain.info?.symbol||(cfg.network==='mainnet'?'USDC':'test token'),feeBps:chain.chainConfig.fee_bps??null,admin:chain.chainConfig.admin??null,paymentsEnabled:cfg.network!=='mainnet',scope:cfg.scope??JSON.stringify([cfg.network,cfg.escrow,cfg.token])});
   if(pathname==='/api/auth/challenge'&&req.method==='POST'){
    const recent=store.all('challenge').filter(x=>x.expires>now);if(recent.length>500)return send({error:'Authentication busy'},429);
    for(const old of store.all('challenge'))if(old.expires<=now)store.remove('challenge',old.id);
    const id=randomBytes(24).toString('hex'),nonce=randomBytes(32).toString('base64'),value={id,nonce,scope:cfg.scope,message:'Sign in to Supply Line '+cfg.network+'. Escrow: '+cfg.escrow+'. No payment. Challenge: '+id,recipient:cfg.origin,expires:now+300000};store.put('challenge',id,value);setCookie('sl_challenge',id,300);return send(value,200,{'Set-Cookie':cookies});
   }
   if(pathname==='/api/auth/verify'&&req.method==='POST'){
    const id=cookie(req,'sl_challenge'),challenge=id&&store.get('challenge',id);if(!challenge||challenge.expires<now||body.challengeId!==id||challenge.scope!==cfg.scope)return send({error:'Login challenge expired'},401);
    store.remove('challenge',id); // Consume before awaiting RPC: one challenge cannot mint two sessions.
    const account=await chain.authenticate(body.signed,{message:challenge.message,recipient:challenge.recipient,nonce:Buffer.from(challenge.nonce,'base64')});
    if(cfg.players.length&&!cfg.players.includes(account))return send({error:'This Testnet server is invite-only'},403);
    const token=randomBytes(32).toString('hex'),session={account,scope:cfg.scope,csrf:randomBytes(24).toString('hex'),expires:now+12*3600000};store.put('session',hash(token),session);setCookie('sl_session',token,12*3600);setCookie('sl_challenge','',0);return send({account,csrf:session.csrf},200,{'Set-Cookie':cookies});
   }
   const raw=cookie(req,'sl_session'),session=raw&&store.get('session',hash(raw));if(!session||session.expires<now||(session.scope!==cfg.scope&&!(cfg.network==='testnet'&&!session.scope)))return send({error:'Connect and sign in with your selected-network wallet'},401);
   if(req.method==='POST'&&req.headers['x-csrf-token']!==session.csrf)return send({error:'Session token changed; reload'},403);
   const account=session.account;
   if(pathname==='/api/auth/session')return send({account,csrf:session.csrf});
   if(pathname==='/api/auth/logout'&&req.method==='POST'){store.remove('session',hash(raw));setCookie('sl_session','',0);return send({ok:true},200,{'Set-Cookie':cookies});}
   if(pathname==='/api/balance'){
    const cached=balanceCache.get(account);if(cached&&now-cached.at<15000)return send(await cached.promise);
    const entry={at:now};entry.promise=chain.balance(account).catch(error=>{if(balanceCache.get(account)===entry)balanceCache.delete(account);throw error;});balanceCache.set(account,entry);return send(await entry.promise);
   }
   if(pathname==='/api/payment-status'&&req.method==='POST'){
    if(!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(body.hash||''))throw Error('Invalid transaction hash');
    await chain.assertNetwork();
    const tx=await chain.rpc('tx',{tx_hash:body.hash,sender_account_id:account,wait_until:'FINAL'});
    if(tx.transaction?.signer_id!==account||tx.transaction?.hash!==body.hash)throw Error('Transaction signer or hash mismatch');
    return send({final:tx.final_execution_status==='FINAL',failed:tx.final_execution_status==='FINAL'&&!!tx.status?.Failure});
   }
   if(pathname==='/api/register'&&req.method==='POST'){requirePayments(cfg);const balance=await chain.balance(account);if(balance.registered)return send({alreadyRegistered:true});if(BigInt(balance.nearAvailable)<BigInt(balance.storageMinimum)+BigInt(balance.gasReserve))throw Error('Insufficient spendable NEAR for storage and gas');return send({network:cfg.network,transaction:call(cfg.token,'storage_deposit',{account_id:account,registration_only:true},balance.storageMinimum)});}
   if(pathname.startsWith('/api/matches')||pathname.startsWith('/api/lobbies'))requirePayments(cfg);
   if(pathname==='/api/lobbies'&&req.method==='GET'){
    const allowed=['limit','offset','sort','order','minStake','maxStake'];
    if([...url.searchParams.keys()].some(k=>!allowed.includes(k)||url.searchParams.getAll(k).length!==1))throw Error('Invalid lobby query');
    return send(await service.lobbies(Object.fromEntries(url.searchParams)));
   }
   const publicJoin=pathname.match(/^\/api\/lobbies\/([a-f0-9]{12})\/join$/);
   if(publicJoin&&req.method==='POST')return send(await service.join(publicJoin[1],account,{publicOnly:true}));
   if(pathname==='/api/matches'&&req.method==='GET')return send(service.list(account));
   if(pathname==='/api/matches'&&req.method==='POST')return send(await service.create(account,body.amount,body.id,body.visibility));
   const route=pathname.match(/^\/api\/matches\/([a-f0-9]{12})(?:\/(join|command|transaction|preview))?$/);
   if(!route)return send({error:'Not found'},404);
   const [,code,action]=route;
   if(action==='preview'&&req.method==='GET')return send(service.preview(code));
   if(action==='join'&&req.method==='POST')return send(await service.join(code,account));
   if(!action&&req.method==='GET'){
    const value=service.snapshot(code,account,{touch:true}),metadata=url.searchParams.get('view')==='metadata';
    value.hasStates=!!value.states;if(metadata)delete value.states;
    // serverNow is advisory; it must not invalidate unchanged paused/lobby snapshots.
    const {states,serverNow,...meta}=value,key=code+':'+value.side+':'+metadata,stamp=JSON.stringify(meta);
    let cached=wireCache.get(key);
    if(!cached||cached.stamp!==stamp){
     const text=JSON.stringify(value);cached={stamp,text,etag:'"'+hash(text)+'"',gzip:null};wireCache.set(key,cached);
     // Bounded by cached responses, including archived games; no unbounded per-poll history.
     if(wireCache.size>800)wireCache.delete(wireCache.keys().next().value);
    }
    const extra={'ETag':cached.etag,'Cache-Control':'private, no-cache','Vary':'Accept-Encoding'};
    if(req.headers['if-none-match']===cached.etag){res.writeHead(304,{...headers,...extra});return res.end();}
    if(/\bgzip\b/.test(req.headers['accept-encoding']||'')&&cached.text.length>2048){cached.gzip??=gzipSync(cached.text,{level:1});res.writeHead(200,{...headers,...extra,'Content-Type':'application/json','Content-Encoding':'gzip'});return res.end(cached.gzip);}
    res.writeHead(200,{...headers,...extra,'Content-Type':'application/json'});return res.end(cached.text);
   }
   if(action==='command'&&req.method==='POST'){
    try{return send(await service.enqueueCommand(code,account,body));}catch(e){if(e.message.startsWith('Command queue busy'))return send({error:e.message},503);throw e;}
   }
   if(action==='transaction'&&req.method==='POST'){
    const {m,i}=service.member(code,account),c=await chain.match(m.chainId);if(!c)return send({error:'Escrow match missing'},409);
    if(c.creator!==m.players[0]||c.opponent!==m.players[1]||c.stake!==m.stake)throw Error('Escrow terms mismatch');
    const kind=body.kind,args={match_id:c.id};let tx;
    if(kind==='deposit'){
     const terms=body.terms;if(c.state!=='AwaitingDeposits'||c.deposited[i]||!c.opponent||!terms||terms.stake!==c.stake||terms.revision!==c.revision||terms.feeBps!==c.fee_bps||terms.opponent!==m.players[1-i])throw Error('Deposit terms changed. Review them again.');
     const funding=await chain.balance(account);if(!funding.registered)throw Error('Register your token account first');if(BigInt(funding.balance)<BigInt(c.stake))throw Error('Insufficient token balance');if(!funding.hasGas)throw Error('Insufficient spendable NEAR for gas');
     tx=call(cfg.token,'ft_transfer_call',{receiver_id:cfg.escrow,amount:c.stake,msg:JSON.stringify({match_id:c.id,revision:c.revision,stake:c.stake,fee_bps:c.fee_bps})},'1');
    }else if(kind==='cancel'&&['LobbyOpen','AwaitingDeposits','ReadyToStart'].includes(c.state))tx=call(cfg.escrow,'cancel_unstarted_match',args,'1');
    else if(kind==='forfeit'&&c.state==='InProgress')tx=call(cfg.escrow,'forfeit_match',args,'1');
    else if(kind==='emergency'&&c.state==='InProgress'){
     if(await chain.chainTime()<BigInt(c.last_heartbeat_ns)+1800000000000n)throw Error('Emergency refund is not available yet');
     tx=call(cfg.escrow,'request_emergency_refund',args,'1');
    }
    else if(kind==='mutual'&&c.state==='InProgress'){
     if(c.cancel_requester===account)throw Error('Waiting for the opponent to approve your cancellation request');
     tx=call(cfg.escrow,c.cancel_requester?'confirm_mutual_cancel':'request_mutual_cancel',c.cancel_requester?{...args,nonce:c.cancel_nonce}:args,'1');
    }
    else if(kind==='claim'){
     const index=c.payouts.findIndex(p=>p.receiver===account&&p.state==='Ready'&&p.amount!=='0');if(index<0)throw Error('No ready payout for this account');
     tx=call(cfg.escrow,'claim_payout',{...args,index},'1');
    }
    else throw Error('Action unavailable in current escrow state');
    if(kind!=='deposit'){const funding=await chain.balance(account);if(!funding.hasGas)throw Error('Insufficient spendable NEAR for gas');}
    return send({network:cfg.network,transaction:tx});
   }
   return send({error:'Method not allowed'},405);
  }catch(error){status=error.pending?202:error.rpc?503:400;send({error:error.pending?error.message:'Action unavailable: '+(error.rpc?'NEAR RPC is unavailable; try again.':error.message)},status);}
 });
 server.on('clientError',(_err,socket)=>socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'));return server;
}
