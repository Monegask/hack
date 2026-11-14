import {randomBytes,randomUUID} from 'node:crypto';
import {engines,newGame,relink,applyCommand} from './game.mjs';
export class GameService{
 constructor(cfg,store,chain,now=()=>Date.now()){
  this.cfg=cfg;this.store=store;this.chain=chain;this.now=now;this.matches=new Map();this.worlds=new Map();this.busy=new Set();this.lastPump=now();this.acc=0;this.lastHeartbeat=0;
  for(const m of store.all('match')){if(m.states)relink(m.states);m.seen=[0,0];if(m.phase==='playing')m.recovering=true;this.matches.set(m.code,m);}
 }
 save(m){this.store.put('match',m.code,m);}
 holdsSlot(m){return !['finished','cancelled'].includes(m.phase)&&!['SettlementPending','Completed','Cancelled'].includes(m.chain?.state);}
 active(account){return [...this.matches.values()].find(m=>this.holdsSlot(m)&&m.players.includes(account));}
 async create(account,amount,requestId){
  if(!/^[a-zA-Z0-9-]{8,80}$/.test(requestId||''))throw Error('Missing create request ID');
  const prior=[...this.matches.values()].find(m=>m.requestId===requestId&&m.players[0]===account);if(prior){if(prior.amount!==undefined&&prior.amount!==amount)throw Error('Create request reused with different terms');return this.snapshot(prior.code,account);}
  if(this.active(account))throw Error('Finish your current match first');
  if([...this.matches.values()].filter(m=>this.holdsSlot(m)).length>=this.cfg.maxActive)throw Error('Test server is full');
  if(!/^(?:[1-9]\d{0,2})(?:\.\d{1,6})?$/.test(amount||''))throw Error('Test stake must be 1–100 tokens');
  const [whole,fraction='']=amount.split('.'),stake=BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,'0'));if(stake>100000000n)throw Error('Maximum test stake is 100 tokens');
  const m={code:randomBytes(6).toString('hex'),requestId,players:[account,null],stake:String(stake),seed:randomBytes(4).readUInt32LE(),phase:'creating',chainId:null,chain:null,states:null,result:null,created:this.now(),seen:[this.now(),0],revision:0,error:null};
  m.amount=amount;this.matches.set(m.code,m);this.save(m);try{await this.reconcile(m);}catch{}return this.snapshot(m.code,account);
 }
 async join(code,account){
  const m=this.memberOrLobby(code);if(m.players.includes(account))return this.snapshot(code,account);
  if(m.phase!=='lobby'||m.players[1]||Number(BigInt(m.chain?.deadline_ns||'0')/1000000n)<=this.now())throw Error('Lobby is closed or full');if(this.active(account))throw Error('Finish your current match first');
  // Reserve and persist before awaiting the chain: two HTTP joins cannot take the same seat.
  m.players[1]=account;m.phase='binding';m.seen[1]=this.now();this.save(m);try{await this.reconcile(m);}catch(e){if(!m.players.includes(account))throw e;}return this.snapshot(code,account);
 }
 memberOrLobby(code){const m=this.matches.get(code);if(!m)throw Error('Lobby not found');return m;}
 member(code,account){const m=this.memberOrLobby(code),i=m.players.indexOf(account);if(i<0)throw Error('Not a participant');return {m,i};}
 snapshot(code,account,{touch=false}={}){
  const {m,i}=this.member(code,account);if(touch)m.seen[i]=this.now();
  return {code:m.code,players:m.players,side:i,stake:m.stake,seed:m.seed,phase:m.phase,chainId:m.chainId,chain:m.chain,states:m.states,revision:m.revision,result:m.result,error:m.error,recovering:!!m.recovering,serverNow:Math.floor(this.now()),control:this.chain.adapter?this.chain.chainConfig:undefined,lastSequence:m.sequences?.[i]||0};
 }
 list(account){return [...this.matches.values()].filter(m=>m.players.includes(account)).map(m=>({code:m.code,phase:m.phase,chainId:m.chainId,players:m.players,stake:m.stake,created:m.created})).sort((a,b)=>b.created-a.created);}
 preview(code){const m=this.memberOrLobby(code);return {code,creator:m.players[0],stake:m.stake,phase:m.phase,available:m.phase==='lobby'&&!m.players[1],feeBps:m.chain?.fee_bps??this.chain.chainConfig?.fee_bps};}
 command(code,account,{id,sequence,command}){
  const {m,i}=this.member(code,account);if(!/^[a-zA-Z0-9-]{8,80}$/.test(id||''))throw Error('Invalid command ID');
  const old=this.store.command(code,account,id);if(old){if(JSON.stringify(old.command)!==JSON.stringify(command))throw Error('Command ID reused');return old.response;}
  if(m.phase!=='playing'||m.recovering)throw Error('Match is not accepting commands');
  m.sequences??=[0,0];if(sequence!==m.sequences[i]+1)throw Error('Command sequence changed; refresh match');
  const backup=structuredClone(m.states);let ok;
  try{ok=applyCommand(this.getEngines(m)[i],m.states[i],command,i);}catch(error){m.states=relink(backup);throw error;}
  const response={accepted:!!ok,notice:m.states[i].notice||'',sequence};m.states[i].notice='';m.sequences[i]=sequence;m.revision++;m.seen[i]=this.now();
  try{this.store.transaction(()=>{this.save(m);this.store.putCommand(code,account,id,{command,response,at:this.now(),time:m.states[i].time});});}catch(e){m.states=relink(backup);m.sequences[i]--;throw e;}
  return response;
 }
 getEngines(m){if(!this.worlds.has(m.code))this.worlds.set(m.code,engines(m.seed));return this.worlds.get(m.code);}
 advance(){
  const now=this.now(),dt=Math.max(0,Math.min(.5,(now-this.lastPump)/1000));this.lastPump=now;this.acc+=dt;
  while(this.acc>=.1){this.acc-=.1;for(const m of this.matches.values()){
   if(m.phase!=='playing'||!m.states)continue;
   const connected=m.seen.map(t=>now-t<120000);
   if(m.recovering){if(connected.every(Boolean)){m.recovering=false;this.save(m);}else continue;}
   if(!connected[0]&&!connected[1]){m.phase='refund';m.result={reason:'both-disconnected',winner:null};m.states.forEach(s=>s.paused=true);this.save(m);continue;}
   if(!connected[0]||!connected[1]){this.finish(m,connected[0]?0:1,'disconnect');continue;}
   const e=this.getEngines(m);for(let i=0;i<2;i++){m.states[i].paused=false;e[i].tick(m.states[i],.1);}
   if(m.states[0].won||m.states[1].won){
    if(m.states.every(s=>s.won)){m.phase='refund';m.result={reason:'simultaneous-finish',winner:null};m.states.forEach(s=>s.paused=true);this.save(m);}
    else this.finish(m,m.states[0].won?0:1,'delivery');
   }m.revision++;
  }}
 }
 finish(m,side,reason){m.result={winner:m.players[side],reason,time:m.states[side].time};m.phase='settling';m.states.forEach(s=>s.paused=true);this.save(m);}
 checkpoint(){for(const m of this.matches.values())if(m.phase==='playing')this.save(m);}
 async reconcile(m){
  if(this.busy.has(m.code))return;this.busy.add(m.code);
  try{
   const control=this.chain.adapter?await this.chain.control():null;
   if(control&&(control.server_frozen||control.paused)&&['creating','binding'].includes(m.phase))throw Error('Escrow admissions unavailable');
   if(m.phase==='creating'){
    const r=await this.chain.execute(m.code+':create','create_lobby',{creator:m.players[0],stake:m.stake});m.chainId=String(r.value);m.phase='lobby';this.save(m);
   }
   if(m.phase==='binding'){
    await this.chain.execute(m.code+':bind:'+m.players[1],'bind_opponent',{match_id:m.chainId,opponent:m.players[1]});
    // Join confirms the exact terms shown on the invitation: a meaningful participant action.
    await this.chain.execute(m.code+':terms-accepted','record_activity',{match_id:m.chainId});m.phase='funding';this.save(m);
   }
   if(!m.chainId)return;
   const chain=await this.chain.match(m.chainId);if(!chain)throw Error('Escrow match missing');
   if(chain.creator!==m.players[0]||chain.opponent!==m.players[1]||chain.stake!==m.stake)throw Error('Escrow participant or stake mismatch');
   m.chain=chain;m.error=null;
   if(['Completed','Cancelled'].includes(chain.state)){m.phase=chain.state==='Completed'?'finished':'cancelled';m.states?.forEach(s=>s.paused=true);this.save(m);return;}
   if(chain.state==='SettlementPending'){m.phase='settling';m.states?.forEach(s=>s.paused=true);this.save(m);return;}
   if(this.chain.adapter&&chain.state==='InProgress'){const reason=this.chain.adapter.refundReason(chain,control,await this.chain.chainTime());if(reason){m.phase='refund';m.error=reason;m.states?.forEach(s=>s.paused=true);this.save(m);return;}}
   if(m.phase==='refund'){this.save(m);return;} // Stop heartbeat; participants can mutually cancel or emergency-refund.
   if(chain.state==='ReadyToStart'){
    m.phase='countdown';this.save(m);const now=await this.chain.chainTime();if(now>=BigInt(chain.deadline_ns))return;
    if(now>=BigInt(chain.ready_at_ns)+3000000000n){
     await this.chain.execute(m.code+':prestart-heartbeat','heartbeat',{match_ids:[]});
     // Persist the initial snapshot before submitting start, so a crash can never start a fresh replacement game.
     m.states??=newGame(m.seed);this.save(m);await this.chain.execute(m.code+':start','start_match',{match_id:m.chainId});
     m.chain=await this.chain.match(m.chainId);if(m.chain.state!=='InProgress')return;m.phase='playing';m.states.forEach(s=>s.paused=false);m.seen=[this.now(),this.now()];this.save(m);
    }
   }else if(chain.state==='InProgress'){
    const now=await this.chain.chainTime();
    if(now>=BigInt(chain.last_heartbeat_ns)+1800000000000n){m.phase='refund';m.error='Heartbeat expired. Request an emergency refund.';m.states?.forEach(s=>s.paused=true);this.save(m);return;}
    if(!m.states){m.phase='refund';m.error='Game snapshot missing. Request a refund.';this.save(m);return;}
    if(m.phase==='countdown'){m.phase='playing';m.recovering=true;m.seen=[0,0];}
    if(m.phase==='settling'&&m.result?.winner){
     await this.chain.execute(m.code+':result','submit_result',{match_id:m.chainId,winner:m.result.winner});m.chain=await this.chain.match(m.chainId);if(m.chain.state==='Completed')m.phase='finished';
    }
   }
   this.save(m);
   }catch(e){
    const create=this.store.get('outbox',m.code+':create'),bind=this.store.get('outbox',m.code+':bind:'+m.players[1]),start=this.store.get('outbox',m.code+':start');
    if(m.phase==='creating'&&create?.status==='failed')m.phase='cancelled';
    if(m.phase==='binding'&&bind?.status==='failed'){m.players[1]=null;m.phase='lobby';}
    if(m.phase==='countdown'&&start?.status==='failed')m.phase='refund';
    m.error=e.pending?e.message:'Blockchain sync paused. Your match and transaction IDs are saved; retrying reconciliation.';this.save(m);throw e;
   }finally{this.busy.delete(m.code);}
 }
 async sync(){
  for(const m of this.matches.values())if(!['finished','cancelled'].includes(m.phase)||m.chain?.payouts?.some(p=>p.state!=='Paid'&&p.amount!=='0')){try{await this.reconcile(m);}catch{}}
  const control=this.chain.adapter?await this.chain.control():null;
  const now=this.now();if(!control?.server_frozen&&now-this.lastHeartbeat>=30000){
   // Deliberately exclude refund-required games, even when their on-chain state is InProgress.
   const ids=[...this.matches.values()].filter(m=>m.phase==='playing'&&!m.recovering).map(m=>m.chainId);
   for(let i=0;i<ids.length;i+=32)await this.chain.execute('heartbeat:'+Math.floor(now/30000)+':'+i,'heartbeat',{match_ids:ids.slice(i,i+32)});
   this.lastHeartbeat=now;
  }
 }
}
