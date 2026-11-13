// Integer-only display: never round a payment through Number.
export function formatUnits(value,decimals=6){
 const n=BigInt(value||'0');if(n<0n)throw Error('Negative amount');
 const scale=10n**BigInt(decimals),fraction=String(n%scale).padStart(decimals,'0').replace(/0+$/,'');
 return (n/scale).toLocaleString('en-US')+(fraction?'.'+fraction:'');
}
export function pendingKey(scope,account){return 'sl-pvp-payment:'+scope+':'+account;}
export function paymentObserved(pending,current,balances){
 if(!pending)return false;
 if(pending.kind==='register')return !!balances?.registered;
 if(current?.code!==pending.code||!current.chain)return false;
 const c=current.chain;
 if(pending.kind==='deposit')return !!c.deposited[current.side];
 if(pending.kind==='claim')return c.payouts?.some((p,index)=>index===pending.payoutIndex&&p.receiver===pending.account&&['InFlight','Paid'].includes(p.state)&&p.amount!=='0');
 if(pending.kind==='mutual')return c.cancel_requester===pending.account||c.state==='Cancelled';
 if(pending.kind==='cancel'||pending.kind==='emergency')return c.state==='Cancelled';
 if(pending.kind==='forfeit')return ['SettlementPending','Completed'].includes(c.state);
 return false;
}
