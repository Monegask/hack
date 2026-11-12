import {Store} from '../server/store.mjs';
import {GameService} from '../server/service.mjs';
import {Chain} from '../server/chain.mjs';
import {verifyMessage} from 'near-api-js/nep413';
export class FakeChain{
 constructor(now){this.now=now;this.cfg={escrow:'escrow.testnet',token:'token.testnet',server:'server.testnet'};this.chainConfig={admin:'admin.testnet',token:this.cfg.token,server:this.cfg.server,fee_bps:300};this.info={symbol:'USDC'};this.matches=new Map();this.operations=new Map();this.results=[];this.heartbeats=[];this.keys=new Map();}
 async authenticate(signed,payload){await verifyMessage({signerAccountId:signed.accountId,signerPublicKey:signed.publicKey,signature:Buffer.from(signed.signature,'base64'),payload,provider:{viewAccessKey:async({accountId,publicKey})=>{if(this.keys.get(accountId)!==String(publicKey))throw Error('Key not owned');return {permission:'FullAccess'};}}});return signed.accountId;}
 async execute(id,method,args){
  if(this.operations.has(id))return this.operations.get(id);
  let value=null;const now=BigInt(this.now())*1000000n;
  if(method==='create_lobby'){
   const n=String(this.matches.size+1);this.matches.set(n,{id:n,creator:args.creator,opponent:null,stake:args.stake,revision:'0',fee_bps:300,fee_receiver:'admin.testnet',state:'LobbyOpen',deposited:[false,false],ready_at_ns:null,last_heartbeat_ns:null,deadline_ns:String(now+600000000000n),payouts:[],cancel_requester:null,cancel_nonce:'0'});value=n;
  }else if(method==='bind_opponent'){const m=this.matches.get(args.match_id);m.opponent=args.opponent;m.state='AwaitingDeposits';}
  else if(method==='start_match'){const m=this.matches.get(args.match_id);if(m.state!=='ReadyToStart'||now<BigInt(m.ready_at_ns)+3000000000n)throw Error('Not ready');m.state='InProgress';m.last_heartbeat_ns=String(now);}
  else if(method==='heartbeat'){this.heartbeats.push(args.match_ids);for(const id of args.match_ids){const m=this.matches.get(id);if(now<BigInt(m.last_heartbeat_ns)+1800000000000n)m.last_heartbeat_ns=String(now);}}
  else if(method==='record_activity'){}
  else if(method==='submit_result'){
   const m=this.matches.get(args.match_id);if(m.state!=='InProgress'||![m.creator,m.opponent].includes(args.winner))throw Error('Bad result');
   const bank=BigInt(m.stake)*2n,fee=bank*300n/10000n;m.winner=args.winner;m.payouts=[{receiver:args.winner,amount:String(bank-fee),state:'Paid',attempt:'1'},{receiver:'admin.testnet',amount:String(fee),state:'Paid',attempt:'1'}];m.state='Completed';this.results.push(args);
  }else throw Error('Unexpected fake-chain method '+method);
  const result={hash:'fixture-'+id,value};this.operations.set(id,result);return result;
 }
 async match(id){return structuredClone(this.matches.get(String(id)));}
 async chainTime(){return BigInt(this.now())*1000000n;}
 async balance(){return {balance:'20000000',registered:true,storageMinimum:'1250000000000000000000'};}
 deposit(id){const m=this.matches.get(id);m.deposited=[true,true];m.state='ReadyToStart';m.ready_at_ns=String(BigInt(this.now())*1000000n);}
}
export function fixture(){let clock=1800000000000;const now=()=>clock,store=new Store('',{memory:true}),chain=new FakeChain(now),cfg={...chain.cfg,origin:'http://localhost:4190',network:'testnet',maxActive:10,players:[]},game=new GameService(cfg,store,chain,now);return {now,store,chain,cfg,game,step(ms){clock+=ms;game.advance();}};}
export async function playing(f){const created=await f.game.create('alice.testnet','5','create-request-001');await f.game.join(created.code,'bob.testnet');const m=f.game.matches.get(created.code);f.chain.deposit(m.chainId);f.step(3100);await f.game.reconcile(m);return m;}
