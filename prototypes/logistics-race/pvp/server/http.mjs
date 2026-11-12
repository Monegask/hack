import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {root} from './config.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
const cookie=(req,name)=>req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1);
const call=(receiverId,methodName,args,deposit='0',gas='150000000000000')=>({receiverId,actions:[{type:'FunctionCall',params:{methodName,args,deposit,gas}}]});
export function createApp(cfg,store,chain,service){
 const limits=new Map();let balanceCache=new Map();
 const server=http.createServer(async(req,res)=>{
  let status=200;const headers={'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Cache-Control':'no-store','X-Frame-Options':'SAMEORIGIN'};
  const send=(value,code=200,extra={})=>{res.writeHead(code,{...headers,'Content-Type':'application/json',...extra});res.end(JSON.stringify(value));};
  const cookies=[];const setCookie=(name,value,maxAge)=>{cookies.push(`${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${cfg.origin.startsWith('https:')?'; Secure':''}`);};
  try{
   const url=new URL(req.url,cfg.origin),pathname=url.pathname;
   if(req.method!=='GET'&&req.method!=='POST')return send({error:'Method not allowed'},405);
   if(req.method==='POST'&&req.headers.origin!==cfg.origin) return send({error:'Origin rejected'},403);
   if(!pathname.startsWith('/api/')){
    if(req.method!=='GET')return send({error:'Not found'},404);
    if(pathname==='/healthz')return send({ok:true,network:'testnet'});
    if(pathname==='/pvp/game'){
     const raw=cookie(req,'sl_session'),session=raw&&store.get('session',hash(raw));if(!session||session.expires<Date.now())return send({error:'Connect your wallet first'},401);
     const snapshot=service.snapshot(url.searchParams.get('match'),session.account),file=path.join(root,'public/game.html');
     const config={code:snapshot.code,seed:snapshot.seed,side:snapshot.side,csrf:session.csrf};
     const html=fs.readFileSync(file,'utf8').replace('__PVP_CONFIG__',JSON.stringify(config).replaceAll('<','\\u003c'));
     res.writeHead(200,{...headers,'Content-Type':'text/html; charset=utf-8'});return res.end(html);
    }
    const files={'/':'index.html','/pvp':'index.html','/pvp/':'index.html','/pvp/app.js':'app.js','/pvp/style.css':'style.css'};
    const file=files[pathname];if(!file)return send({error:'Not found'},404);
    res.writeHead(200,{...headers,'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html; charset=utf-8'});return fs.createReadStream(path.join(root,'public',file)).pipe(res);
   }
   const ip=req.socket.remoteAddress||'unknown',now=Date.now(),rate=limits.get(ip)||{at:now,n:0};if(now-rate.at>1000){rate.at=now;rate.n=0;}if(++rate.n>45)return send({error:'Too many requests'},429);limits.set(ip,rate);
   if(limits.size>2000)for(const [key,v] of limits)if(now-v.at>60000)limits.delete(key);
   let body={};if(req.method==='POST'){
    if(!req.headers['content-type']?.startsWith('application/json'))return send({error:'Expected JSON'},415);
    let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>8192)return send({error:'Request too large'},413);}body=JSON.parse(text||'{}');
   }
   if(pathname==='/api/config')return send({network:'testnet',token:cfg.token,escrow:cfg.escrow,symbol:chain.info?.symbol||'test token',feeBps:chain.chainConfig.fee_bps,admin:chain.chainConfig.admin});
   if(pathname==='/api/auth/challenge'&&req.method==='POST'){
    const recent=store.all('challenge').filter(x=>x.expires>now);if(recent.length>500)return send({error:'Authentication busy'},429);
    for(const old of store.all('challenge'))if(old.expires<=now)store.remove('challenge',old.id);
    const id=randomBytes(24).toString('hex'),nonce=randomBytes(32).toString('base64'),value={id,nonce,message:'Sign in to Supply Line Testnet. No payment. Challenge: '+id,recipient:cfg.origin,expires:now+300000};store.put('challenge',id,value);setCookie('sl_challenge',id,300);return send(value,200,{'Set-Cookie':cookies});
   }
   if(pathname==='/api/auth/verify'&&req.method==='POST'){
    const id=cookie(req,'sl_challenge'),challenge=id&&store.get('challenge',id);if(!challenge||challenge.expires<now||body.challengeId!==id)return send({error:'Login challenge expired'},401);
    store.remove('challenge',id); // Consume before awaiting RPC: one challenge cannot mint two sessions.
    const account=await chain.authenticate(body.signed,{message:challenge.message,recipient:challenge.recipient,nonce:Buffer.from(challenge.nonce,'base64')});
    if(cfg.players.length&&!cfg.players.includes(account))return send({error:'This Testnet server is invite-only'},403);
    const token=randomBytes(32).toString('hex'),session={account,csrf:randomBytes(24).toString('hex'),expires:now+12*3600000};store.put('session',hash(token),session);setCookie('sl_session',token,12*3600);setCookie('sl_challenge','',0);return send({account,csrf:session.csrf},200,{'Set-Cookie':cookies});
   }
   const raw=cookie(req,'sl_session'),session=raw&&store.get('session',hash(raw));if(!session||session.expires<now)return send({error:'Connect and sign in with your Testnet wallet'},401);
   if(req.method==='POST'&&req.headers['x-csrf-token']!==session.csrf)return send({error:'Session token changed; reload'},403);
   const account=session.account;
   if(pathname==='/api/auth/session')return send({account,csrf:session.csrf});
   if(pathname==='/api/auth/logout'&&req.method==='POST'){store.remove('session',hash(raw));setCookie('sl_session','',0);return send({ok:true},200,{'Set-Cookie':cookies});}
   if(pathname==='/api/balance'){
    const cached=balanceCache.get(account);if(cached&&now-cached.at<15000)return send(await cached.promise);
    const entry={at:now};entry.promise=chain.balance(account).catch(error=>{if(balanceCache.get(account)===entry)balanceCache.delete(account);throw error;});balanceCache.set(account,entry);return send(await entry.promise);
   }
   if(pathname==='/api/register'&&req.method==='POST'){const balance=await chain.balance(account);return send({transaction:call(cfg.token,'storage_deposit',{account_id:account,registration_only:true},balance.storageMinimum)});}
   if(pathname==='/api/matches'&&req.method==='GET')return send(service.list(account));
   if(pathname==='/api/matches'&&req.method==='POST')return send(await service.create(account,body.amount,body.id));
   const route=pathname.match(/^\/api\/matches\/([a-f0-9]{12})(?:\/(join|command|transaction|preview))?$/);
   if(!route)return send({error:'Not found'},404);
   const [,code,action]=route;
   if(action==='preview'&&req.method==='GET')return send(service.preview(code));
   if(action==='join'&&req.method==='POST')return send(await service.join(code,account));
   if(!action&&req.method==='GET')return send(service.snapshot(code,account,{touch:true}));
   if(action==='command'&&req.method==='POST')return send(service.command(code,account,body));
   if(action==='transaction'&&req.method==='POST'){
    const {m,i}=service.member(code,account),c=await chain.match(m.chainId);if(!c)return send({error:'Escrow match missing'},409);
    if(c.creator!==m.players[0]||c.opponent!==m.players[1]||c.stake!==m.stake)throw Error('Escrow terms mismatch');
    const kind=body.kind,args={match_id:c.id};let tx;
    if(kind==='deposit'){
     const terms=body.terms;if(c.state!=='AwaitingDeposits'||c.deposited[i]||!c.opponent||!terms||terms.stake!==c.stake||terms.revision!==c.revision||terms.feeBps!==c.fee_bps||terms.opponent!==m.players[1-i])throw Error('Deposit terms changed. Review them again.');
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
    return send({transaction:tx});
   }
   return send({error:'Method not allowed'},405);
  }catch(error){status=error.pending?202:error.rpc?503:400;send({error:error.pending?error.message:'Action unavailable: '+(error.rpc?'NEAR RPC is unavailable; try again.':error.message)},status);}
 });
 server.on('clientError',(_err,socket)=>socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'));return server;
}
