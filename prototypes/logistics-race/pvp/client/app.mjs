import {NearConnector} from '@hot-labs/near-connect';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const amount=formatUnits;
import {formatUnits,pendingKey,paymentObserved} from './finance.mjs';
let session=null,cfg=null,current=null,balances=null,polling=false,paying=false,openedMatch=null;
let reconnectMessage=null,nextPollAt=0,pollFailures=0,lastIdleRefresh=0;
let connector;
const tokenLabel=()=>`${cfg.network==='testnet'?'test ':''}${cfg.symbol}`;
const matchKey=()=>`sl-pvp-match:${cfg.scope}`;
function pending(){return session&&JSON.parse(localStorage.getItem(pendingKey(cfg.scope,session.account))||'null');}
async function reconcilePayment(){const p=pending();if(!p)return;if(p.kind==='register')balances=await api('balance');let resolved=paymentObserved(p,current,balances);if(!resolved&&p.hash){const status=await api('payment-status',{hash:p.hash});resolved=status.final&&status.failed;}if(resolved){localStorage.removeItem(pendingKey(cfg.scope,session.account));if(current)renderMatch();}else message('Payment status is unknown or pending. Do not pay again. Check the wallet and final escrow state.');}
async function sendWallet(kind,transaction){
 const run=async()=>{
  if(pending())throw Error('A payment is unresolved. Check the wallet and escrow before retrying.');
  if(!cfg.paymentsEnabled)throw Error('Mainnet payments are disabled pending escrow API, audit and competition approval');
  const w=await wallet(),key=pendingKey(cfg.scope,session.account);
  const record={kind,code:current?.code,account:session.account,at:Date.now(),payoutIndex:kind==='claim'?transaction.actions[0].params.args.index:null};
  localStorage.setItem(key,JSON.stringify(record));
  // Any exception may follow a broadcast. Keep the journal until chain evidence resolves it.
  let result;try{result=await w.signAndSendTransaction({...transaction,network:cfg.network,signerId:session.account});}catch(error){record.hash=error?.transactionHash||null;localStorage.setItem(key,JSON.stringify(record));throw error;}
  record.hash=result?.transaction?.hash||result?.transactionHash||null;localStorage.setItem(key,JSON.stringify(record));
 };
 if(!navigator.locks)throw Error('This browser cannot safely coordinate payments across tabs. Use a current browser.');
 return navigator.locks.request('sl-pvp-wallet:'+cfg.scope,{ifAvailable:true},lock=>{if(!lock)throw Error('Another tab is signing a transaction');return run();});
}
async function api(url,body){const r=await fetch('/api/'+url,{signal:AbortSignal.timeout(20000),method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',...(session?{'x-csrf-token':session.csrf}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});if(cfg&&r.headers.get('X-Supply-Line-Scope')!==cfg.scope)throw Error('Server network or deployment changed. Reload before continuing.');const v=await r.json();if(!r.ok||(r.status===202&&!v.code))throw Error(v.error||'Request failed');return v;}
function message(s=''){$('message').textContent=s;}
async function action(fn){try{message();await fn();}catch(e){message(e.message||'Action failed');}}
async function wallet(){const w=await connector.wallet(),accounts=await w.getAccounts();if(session&&!accounts.some(a=>a.accountId===session.account))throw Error('Wallet account changed. Sign out and connect the match account.');return w;}
async function connect(){
 const w=await connector.connect();const challenge=await api('auth/challenge',{});
 if(challenge.scope!==cfg.scope)throw Error('Authentication network changed; reload');
 const signed=await w.signMessage({message:challenge.message,recipient:challenge.recipient,nonce:Uint8Array.from(atob(challenge.nonce),c=>c.charCodeAt(0)),network:cfg.network});
 if(!signed)throw Error('Signature cancelled. Connect again.');session=await api('auth/verify',{challengeId:challenge.id,signed});await refresh();
 const invite=new URLSearchParams(location.search).get('join');if(invite&&cfg.paymentsEnabled){$('code').value=invite;await preview(invite);}
}
let lobbyOffset=0,lobbyRequest=0,lastLobbyRefresh=0;
async function refreshLobbies(){
 if(!session||!cfg.paymentsEnabled)return;const request=++lobbyRequest,[sort,order]=$('lobbySort').value.split(':');
 try{
  const page=await api(`lobbies?limit=10&offset=${lobbyOffset}&sort=${sort}&order=${order}`);
  if(request!==lobbyRequest||!session)return;
  if(!page.items.length&&lobbyOffset>0){lobbyOffset=0;return refreshLobbies();}
  $('publicList').innerHTML=page.items.length?page.items.map(m=>`<div class="match-row"><div class="lobby-details"><strong>${amount(m.stake)} ${esc(tokenLabel())}</strong><span>${esc(m.creator)} · Open</span><time datetime="${new Date(m.created).toISOString()}">${esc(new Date(m.created).toLocaleString('en-US'))}</time></div><button data-lobby="${esc(m.id)}" ${m.creator===session.account?'disabled':''}>${m.creator===session.account?'Your lobby':'Join'}</button></div>`).join(''):'No open public lobbies. Create one to find an opponent.';
  $('previousLobbies').disabled=lobbyOffset===0;$('nextLobbies').disabled=!page.hasMore;$('lobbyPage').textContent=`${page.total} open · Page ${Math.floor(lobbyOffset/10)+1}`;lastLobbyRefresh=Date.now();
  for(const b of $('publicList').querySelectorAll('[data-lobby]'))b.onclick=()=>action(async()=>{
   b.disabled=true;
   try{current=await api('lobbies/'+b.dataset.lobby+'/join',{});sessionStorage.setItem(matchKey(),current.code);renderMatch();}
   finally{await refreshLobbies();}
  });
 }catch(e){if(request===lobbyRequest){$('publicList').textContent='Unable to refresh public lobbies. Retry to check availability.';$('nextLobbies').disabled=true;$('previousLobbies').disabled=true;}throw e;}
}
function ledger(stake,feeBps){const bank=BigInt(stake)*2n,fee=bank*BigInt(feeBps)/10000n;return `<div class="ledger"><span>Stake per player</span><b>${amount(stake)} ${esc(tokenLabel())}</b><span>Prize pool</span><b>${amount(bank)}</b><span>Game fee · ${feeBps/100}%</span><b>${amount(fee)}</b><strong>Winner receives</strong><strong>${amount(bank-fee)} ${esc(tokenLabel())}</strong></div>`;}
function parseAmount(text){if(!/^[1-9]\d{0,2}(\.\d{1,6})?$/.test(text))return null;const [a,b='']=text.split('.');return String(BigInt(a)*1000000n+BigInt(b.padEnd(6,'0')));}
function updateTerms(){if(!cfg.paymentsEnabled){$('terms').textContent='Mainnet escrow terms unavailable. Payments are disabled.';return;}const value=parseAmount($('amount').value);$('terms').innerHTML=value?ledger(value,cfg.feeBps):'<p>Enter 1–100 test tokens.</p>';}
function codeFrom(text){const match=text.match(/(?:join=)?([a-f0-9]{12})(?:$|[&#])/);if(!match)throw Error('Enter the complete invite link or 12-character code');return match[1];}
async function preview(text){const code=codeFrom(text),m=await api('matches/'+code+'/preview');$('invitation').innerHTML=`<h3>${esc(m.creator)}</h3>${ledger(m.stake,m.feeBps)}<p>${m.available?'Ready to join':'Lobby is unavailable'}</p>${m.available?'<button id="acceptInvite" class="primary">Join this match</button>':''}`;if(m.available)$('acceptInvite').onclick=()=>action(async()=>{current=await api('matches/'+code+'/join',{});sessionStorage.setItem(matchKey(),code);renderMatch();});}
const phaseText={creating:'Creating the on-chain lobby…',lobby:'Waiting for an opponent',binding:'Confirming the opponent on NEAR…',funding:'Both players must deposit their stake',countdown:'Both stakes accepted. Preparing the common start…',playing:'Match in progress · server clock · 1×',settling:'Match ended. Checking prize and fee transfers…',finished:'Prize and fee confirmed',cancelled:'Match cancelled. Check refunds below.',refund:'Match stopped. Both players can agree to cancel, or request an emergency refund after heartbeat expiry.'};
function renderMatch(){
 if(!current)return;$('match').hidden=false;const m=current,c=m.chain,side=m.side,other=m.players[1-side],bank=ledger(m.stake,c?.fee_bps??cfg.feeBps);
 const button=(id,label)=>`<button data-payment="${id}" ${paying||pending()?'disabled':''}>${label}</button>`;
 let controls='';
 if(c?.state==='AwaitingDeposits'&&!c.deposited[side])controls+=button('deposit','Deposit '+amount(c.stake)+' '+esc(tokenLabel()));
 if(c&&['LobbyOpen','AwaitingDeposits','ReadyToStart'].includes(c.state))controls+=button('cancel','Cancel & refund stakes');
 if(c?.state==='InProgress'){
  controls+='<button id="openGame" class="primary">'+(m.phase==='playing'?'Open match':'View stopped match')+'</button>';
  controls+=button('mutual',c.cancel_requester&&c.cancel_requester!==session.account?'Agree to full refund':'Request mutual cancellation');
  if(m.phase==='playing')controls+=button('forfeit','Forfeit · opponent wins');
  if(BigInt(c.last_heartbeat_ns||'0')+1800000000000n<=BigInt(Date.now())*1000000n)controls+=button('emergency','Request emergency refund');
 }
 if(c?.payouts?.some(p=>p.receiver===session.account&&p.state==='Ready'&&p.amount!=='0'))controls+=button('claim','Claim ready payout / refund');
 let payouts=c?.payouts?.filter(p=>p.amount!=='0').map(p=>`<p>${p.receiver===c.fee_receiver?'Fee':c.state==='Cancelled'?'Refund':'Payout'} · ${esc(p.receiver)} · ${amount(p.amount)} ${esc(tokenLabel())} · <b>${esc(p.state)}</b></p>`).join('')||'';
 const link=location.origin+'/pvp/?join='+m.code;
 $('match').innerHTML=`<h2>Match ${esc(m.code)}</h2><div class="status">${esc(phaseText[m.phase]||m.phase)}${m.recovering?'<br>Restoring the game. Both players need to reconnect.':''}</div><p>You: ${esc(session.account)}<br>Opponent: ${esc(other||'Waiting…')}</p>${!other?`<a class="invite" href="${esc(link)}">${esc(link)}</a><button id="copyInvite">Copy invitation</button>`:''}${bank}${c?`<p>Deposits: you ${c.deposited[side]?amount(c.stake)+' accepted':'0 accepted'} · opponent ${c.deposited[1-side]?amount(c.stake)+' accepted':'0 accepted'} ${esc(tokenLabel())}. Total accepted: ${amount(BigInt(c.stake)*BigInt(c.deposited.filter(Boolean).length))}</p><p class="muted">Escrow match #${esc(c.id)} · ${esc(c.state)}</p>`:''}${m.result?`<p><b>${m.result.winner?(m.result.winner===session.account?'You won':'Opponent won'):'Full refund'} · ${esc(m.result.reason)}</b></p>`:''}${m.error?`<div class="status">${esc(m.error)}</div>`:''}<div class="actions">${controls}</div>${payouts}<p class="small muted">Disconnect grace: 120 seconds. Both disconnected or simultaneous finish: full refund via mutual cancellation, or emergency refund after 30 minutes without a match heartbeat. Network fees are separate.</p>`;
 $('copyInvite')?.addEventListener('click',()=>action(async()=>{await navigator.clipboard.writeText(link);message('Invitation copied.');}));
 $('openGame')?.addEventListener('click',openGame);
 for(const b of $('match').querySelectorAll('[data-payment]'))b.onclick=()=>action(()=>payment(b.dataset.payment));
 if(m.phase==='playing'&&!m.recovering&&openedMatch!==m.code)openGame();
 if(['settling','finished','cancelled','refund'].includes(m.phase)&&!$('gameStage').hidden){$('gameStage').hidden=true;$('game').removeAttribute('src');}
}
function openGame(){if(!current?.states&&!current?.hasStates)return message('The server is preparing the match.');openedMatch=current.code;$('game').src='/pvp/game?match='+current.code;$('gameStage').hidden=false;}
async function payment(kind){
 if(paying)return;
 if(pending())throw Error('Previous payment is unresolved. Do not repeat it.');
 if(kind==='forfeit'&&!confirm('Forfeit this match? Your opponent receives the prize.'))return;
 if(kind==='deposit'&&!confirm(`Deposit ${amount(current.stake)} ${tokenLabel()}? Game fee: ${(current.chain.fee_bps/100)}% of the bank.`))return;
 paying=true;renderMatch();try{
  const c=current.chain,terms=c?{stake:c.stake,revision:c.revision,feeBps:c.fee_bps,opponent:current.players[1-current.side]}:null;
  const request=await api('matches/'+current.code+'/transaction',{kind,terms});message('Review the transaction in your '+cfg.network+' wallet.');
  if(request.network!==cfg.network)throw Error('Transaction network mismatch');await sendWallet(kind,request.transaction);message('Transaction sent. Waiting for the escrow to confirm its actual state.');
 }finally{paying=false;await refresh();}
}
async function refresh(){
 $('welcome').hidden=!!session;$('lobbies').hidden=!session;$('account').hidden=!session;$('wallet').textContent=session?'Sign out':'Connect '+cfg.network+' wallet';
 if(!session){lobbyRequest++;$('match').hidden=true;$('gameStage').hidden=true;$('game').removeAttribute('src');return;}
 if(cfg.paymentsEnabled)await refreshLobbies();
 balances=await api('balance');$('account').innerHTML=`<strong>${esc(session.account)}</strong><span>${amount(balances.balance)} ${esc(tokenLabel())}</span>${!balances.registered&&cfg.paymentsEnabled?'<button id="register">Register token account</button>':''}<span class="muted">Spendable NEAR: ${formatUnits(balances.nearAvailable,24)} · ${balances.hasGas?'gas reserve available':'insufficient gas reserve'}</span>`;
 $('register')?.addEventListener('click',()=>action(async()=>{const tx=await api('register',{});if(tx.alreadyRegistered)return refresh();if(tx.network!==cfg.network)throw Error('Transaction network mismatch');await sendWallet('register',tx.transaction);message('Token registration sent.');}));
 if(!cfg.paymentsEnabled){$('lobbies').hidden=true;return;}
 const history=await api('matches');$('history').innerHTML=history.length?history.map(m=>`<div class="match-row"><span>${esc(m.code)} · ${esc(m.phase)} · ${amount(m.stake)} ${esc(tokenLabel())}</span><button data-resume="${m.code}">Open</button></div>`).join(''):'No matches yet.';
 for(const b of $('history').querySelectorAll('[data-resume]'))b.onclick=()=>action(async()=>{current=await api('matches/'+b.dataset.resume+'?view=metadata');sessionStorage.setItem(matchKey(),current.code);renderMatch();});
 const code=current?.code||sessionStorage.getItem(matchKey())||pending()?.code;if(code){current=await api('matches/'+code+'?view=metadata');renderMatch();}await reconcilePayment();
}
function connectionFailure(e){reconnectMessage='Connection interrupted. Reconnecting; do not repeat a payment. '+e.message;message(reconnectMessage);}
async function poll(){
 if(session&&cfg.paymentsEnabled&&Date.now()-lastLobbyRefresh>8000){lastLobbyRefresh=Date.now();refreshLobbies().catch(()=>{});}if(polling||!session||Date.now()<nextPollAt)return;polling=true;try{if(current){current=await api('matches/'+current.code+'?view=metadata');renderMatch();await reconcilePayment();}else{if(Date.now()-lastIdleRefresh<15000)return;await refresh();lastIdleRefresh=Date.now();}if(reconnectMessage&&$('message').textContent===reconnectMessage)message();reconnectMessage=null;pollFailures=0;nextPollAt=0;}catch(e){connectionFailure(e);nextPollAt=Date.now()+Math.min(15000,1500*2**Math.min(++pollFailures,4));}finally{polling=false;}}
async function init(){
 cfg=await api('config');if(!['testnet','mainnet'].includes(cfg.network))throw Error('Unsupported network');
 connector=new NearConnector({network:cfg.network,features:{signMessage:true,signAndSendTransaction:true,...(cfg.network==='testnet'?{testnet:true}:{})}});
 document.title='Supply Line · '+cfg.network+' PvP';
 document.querySelector('.banner').textContent=cfg.network==='testnet'?'NEAR TESTNET · Test tokens only. No real money.':'NEAR MAINNET · Native Circle USDC · Payments disabled pending escrow API, independent audit and competition approval.';
 $('connect').textContent='Connect '+cfg.network+' wallet';
 document.querySelector('footer').textContent=cfg.network==='testnet'?'Testnet prototype · Test tokens only.':'Mainnet preparation · No deposits, registrations or payouts are enabled in this release.';
 updateTerms();try{session=await api('auth/session');}catch{}
 $('lobbySort').onchange=()=>{lobbyOffset=0;action(refreshLobbies);};
 $('refreshLobbies').onclick=()=>action(refreshLobbies);
 $('previousLobbies').onclick=()=>{lobbyOffset=Math.max(0,lobbyOffset-10);action(refreshLobbies);};
 $('nextLobbies').onclick=()=>{lobbyOffset+=10;action(refreshLobbies);};
 $('amount').oninput=updateTerms;$('connect').onclick=()=>action(connect);$('wallet').onclick=()=>action(async()=>{if(!session)return connect();await api('auth/logout',{});await connector.disconnect().catch(()=>{});session=null;current=null;sessionStorage.removeItem(matchKey());$('match').hidden=true;await refresh();});
 $('create').onsubmit=e=>{e.preventDefault();action(async()=>{const terms={amount:$('amount').value,visibility:$('visibility').value};let pending;try{pending=JSON.parse(sessionStorage.getItem('sl-pvp-create:'+cfg.scope));}catch{}if(!pending||pending.amount!==terms.amount||pending.visibility!==terms.visibility)pending={...terms,id:crypto.randomUUID()};sessionStorage.setItem('sl-pvp-create:'+cfg.scope,JSON.stringify(pending));current=await api('matches',pending);sessionStorage.removeItem('sl-pvp-create:'+cfg.scope);sessionStorage.setItem(matchKey(),current.code);renderMatch();await refresh();});};
 $('join').onsubmit=e=>{e.preventDefault();action(()=>preview($('code').value));};
 window.addEventListener('message',e=>{if(e.source===$('game').contentWindow&&e.origin===location.origin&&e.data?.type==='supply-line-pvp-home'){$('gameStage').hidden=true;$('game').removeAttribute('src');}});
 connector.on('wallet:signOut',()=>{if(session)message('Wallet disconnected. Reconnect the same account before signing another transaction.');});
 try{await refresh();lastIdleRefresh=Date.now();}catch(e){connectionFailure(e);}$('connect').disabled=false;$('wallet').disabled=false;setInterval(poll,1500);const invite=new URLSearchParams(location.search).get('join');if(invite&&session&&cfg.paymentsEnabled){$('code').value=invite;await preview(invite);}
}
init().catch(e=>message('Unable to load PvP: '+e.message));

