// Wire API pinned to PR #1 / Rust state_version=2. This module never broadcasts.
export const CONTRACT_REVISION='6b6cd1c2f71dead588bbd41e400da9403bc599f8';
export const SERVER_METHODS=Object.freeze(['create_lobby','bind_opponent','update_stake','record_activity','start_match','submit_result','heartbeat']);
export const CIRCLE_USDC='17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1';
const U64=(1n<<64n)-1n,U128=(1n<<128n)-1n;
export function uint(value,bits=64){if(typeof value!=='string'||!/^(0|[1-9]\d*)$/.test(value)||BigInt(value)>(bits===64?U64:U128))throw Error('Invalid u'+bits+' decimal string');return value;}
function account(id){if(typeof id!=='string'||id.length<2||id.length>64||!/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(id))throw Error('Invalid account ID');return id;}
function keys(args,expected){if(!args||Object.keys(args).sort().join(',')!==expected.sort().join(','))throw Error('Unexpected escrow arguments');}
function fee(n){if(!Number.isInteger(n)||n<0||n>500)throw Error('Unsupported escrow fee');return n;}
function bool(n){if(typeof n!=='boolean')throw Error('Invalid boolean');}
const states=['LobbyOpen','AwaitingDeposits','ReadyToStart','InProgress','SettlementPending','Completed','Cancelled'];
export function validateConfig(c,cfg){
 if(!c||c.state_version!==2)throw Error('Escrow v2 required');
 for(const k of ['admin','server','token'])account(c[k]);
 if(c.server!==cfg.server||c.token!==cfg.token||c.admin===c.server||c.admin===cfg.escrow||c.token===cfg.escrow||c.token===c.server||c.token===c.admin)throw Error('Escrow roles/token mismatch');
 if(cfg.network==='mainnet'&&c.token!==CIRCLE_USDC)throw Error('Native Circle USDC required');
 bool(c.paused);bool(c.server_frozen);fee(c.fee_bps);uint(c.last_heartbeat_ns);
 if(c.pending_admin!==null)account(c.pending_admin);
 if(c.pending_fee!==null){fee(c.pending_fee.fee_bps);uint(c.pending_fee.activate_at_ns);}
 return c;
}
export function validateMatch(m){
 if(m===null)return null;if(!m||!states.includes(m.state))throw Error('Unknown escrow match state');
 for(const k of ['id','revision','created_at_ns','deadline_ns','cancel_nonce'])uint(m[k]);
 uint(m.stake,128);if(BigInt(m.stake)<1000000n||BigInt(m.stake)>U128/2n)throw Error('Invalid stake');fee(m.fee_bps);
 for(const k of ['creator','fee_receiver'])account(m[k]);
 for(const k of ['opponent','winner','cancel_requester'])if(m[k]!==null)account(m[k]);
 if(m.creator===m.opponent)throw Error('Duplicate participants');
 for(const k of ['joined_at_ns','ready_at_ns','last_heartbeat_ns','game_deadline_ns'])if(m[k]!==null)uint(m[k]);
 if(!Array.isArray(m.deposited)||m.deposited.length!==2)throw Error('Invalid deposits');m.deposited.forEach(bool);bool(m.activity_confirmed);
 if(!Array.isArray(m.payouts)||m.payouts.length!==2)throw Error('Invalid payouts');
 for(const p of m.payouts){account(p.receiver);uint(p.amount,128);uint(p.attempt);if(!['Ready','InFlight','Paid'].includes(p.state))throw Error('Unknown payout state');}
 if(['InProgress','SettlementPending','Completed'].includes(m.state)&&(!m.game_deadline_ns||!m.last_heartbeat_ns||!m.deposited.every(Boolean)))throw Error('Invalid game lifecycle');
 const bank=BigInt(m.stake)*2n;
 if(['SettlementPending','Completed'].includes(m.state)){
  if(![m.creator,m.opponent].includes(m.winner))throw Error('Invalid winner');
  const f=bank*BigInt(m.fee_bps)/10000n;
  if(m.payouts[0].receiver!==m.winner||m.payouts[1].receiver!==m.fee_receiver||BigInt(m.payouts[0].amount)!==bank-f||BigInt(m.payouts[1].amount)!==f)throw Error('Payout allocation mismatch');
 }
 if(m.state==='Cancelled')for(let i=0;i<2;i++)if(m.payouts[i].receiver!==(i===0?m.creator:m.opponent||m.creator)||BigInt(m.payouts[i].amount)!==(m.deposited[i]?BigInt(m.stake):0n))throw Error('Refund allocation mismatch');
 return m;
}
export function validateRuntimeAccess(access,cfg){
 const p=access?.permission?.FunctionCall;
 if(!p||p.receiver_id!==cfg.escrow||!Array.isArray(p.method_names)||p.method_names.length!==7||new Set(p.method_names).size!==7||!SERVER_METHODS.every(m=>p.method_names.includes(m)))throw Error('Runtime key requires exactly seven methods on escrow only');
 uint(p.allowance,128);const allowance=BigInt(p.allowance);
 if(allowance<10000000000000000000000n||allowance>BigInt(cfg.maxRuntimeAllowance||'1000000000000000000000000'))throw Error('Runtime allowance outside reviewed limits');
 return true;
}
export class EscrowV2Adapter{
 constructor(cfg){this.cfg=cfg;this.version='escrow-v2';}
 config(c){return validateConfig(c,this.cfg);}
 match(m){return validateMatch(m);}
 serverCall(method,args){
  if(!SERVER_METHODS.includes(method))throw Error('Server method not allowed');
  const shapes={create_lobby:['creator','stake'],bind_opponent:['match_id','opponent'],update_stake:['match_id','stake'],record_activity:['match_id'],start_match:['match_id'],submit_result:['match_id','winner'],heartbeat:['match_ids']};keys(args,shapes[method]);
  if(args.match_id!==undefined)uint(args.match_id);
  for(const k of ['creator','opponent','winner'])if(args[k]!==undefined)account(args[k]);
  if(args.stake!==undefined){uint(args.stake,128);if(BigInt(args.stake)<1000000n||BigInt(args.stake)>U128/2n)throw Error('Invalid stake');}
  if(method==='heartbeat'){if(!Array.isArray(args.match_ids)||args.match_ids.length>32||new Set(args.match_ids).size!==args.match_ids.length)throw Error('Invalid heartbeat batch');args.match_ids.forEach(v=>uint(v));}
  return {receiverId:this.cfg.escrow,method,args:structuredClone(args),deposit:'0',gas:'250000000000000'};
 }
 refundReason(m,c,now){if(m.state!=='InProgress')return null;if(c.server_frozen)return 'Server frozen. Request a full emergency refund.';if(now>=BigInt(m.game_deadline_ns))return 'Absolute game deadline reached. Request a full emergency refund.';if(now>=BigInt(m.last_heartbeat_ns)+1800000000000n)return 'Heartbeat expired. Request a full emergency refund.';return null;}
 playerTransaction({kind,match,account:who,terms,now,config}){
  const m=this.match(match),c=this.config(config);account(who);const side=[m.creator,m.opponent].indexOf(who);if(side<0&&!(kind==='claim'&&m.payouts.some(p=>p.receiver===who)))throw Error('Participant only');const args={match_id:m.id};let method,deposit='1',gas='250000000000000',receiver=this.cfg.escrow;
  const live=m.state==='InProgress'&&!this.refundReason(m,c,now);
  if(kind==='deposit'){
   if(c.paused||c.server_frozen||m.state!=='AwaitingDeposits'||!m.opponent||m.deposited[side]||now>=BigInt(m.deadline_ns)||(!m.activity_confirmed&&!m.deposited.some(Boolean)&&m.joined_at_ns&&now>=BigInt(m.joined_at_ns)+90000000000n))throw Error('Deposits unavailable');
   if(!terms||terms.stake!==m.stake||terms.revision!==m.revision||terms.feeBps!==m.fee_bps||terms.opponent!==[m.creator,m.opponent][1-side])throw Error('Deposit terms changed');
   return this.call(this.cfg.token,'ft_transfer_call',{receiver_id:this.cfg.escrow,amount:m.stake,msg:JSON.stringify({match_id:m.id,revision:m.revision,stake:m.stake,fee_bps:m.fee_bps})},'1','150000000000000');
  }
  if(kind==='cancel'&&['LobbyOpen','AwaitingDeposits','ReadyToStart'].includes(m.state))method='cancel_unstarted_match';
  else if(kind==='emergency'&&m.state==='InProgress'&&(c.server_frozen||this.refundReason(m,c,now)))method='request_emergency_refund';
  else if(kind==='forfeit'&&live)method='forfeit_match';
  else if(kind==='mutual'&&live){if(m.cancel_requester===who)throw Error('Waiting for opponent');method=m.cancel_requester?'confirm_mutual_cancel':'request_mutual_cancel';if(m.cancel_requester)args.nonce=m.cancel_nonce;}
  else if(kind==='reject'&&live&&m.cancel_requester&&m.cancel_requester!==who){method='reject_mutual_cancel';args.nonce=m.cancel_nonce;}
  else if(kind==='claim'){const index=m.payouts.findIndex(p=>p.receiver===who&&p.state==='Ready'&&p.amount!=='0');if(index<0)throw Error('No ready payout');method='claim_payout';args.index=index;}
  else throw Error('Action unavailable in escrow state');
  return this.call(receiver,method,args,deposit,gas);
 }
 registration(who,minimum){account(who);uint(minimum,128);return this.call(this.cfg.token,'storage_deposit',{account_id:who,registration_only:true},minimum,'50000000000000');}
 call(receiverId,methodName,args,deposit,gas){return {receiverId,actions:[{type:'FunctionCall',params:{methodName,args,deposit,gas}}]};}
}
