import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';
if(!process.env.AUDIT_PVP_ROOT)throw Error('Set AUDIT_PVP_ROOT to a local PR #3 checkout');
const root=process.env.AUDIT_PVP_ROOT;
const finance=await import(pathToFileURL(path.join(root,'client/finance.mjs')).href);
// Execute the actual reconciliation function in a controlled DOM/storage/RPC harness.
// Module imports and automatic UI boot are removed; no function body is copied.
function clientHarness(status){
 let source=fs.readFileSync(path.join(root,'client/app.mjs'),'utf8').replace(/^import .+;\r?$/gm,'');
 source=source.slice(0,source.lastIndexOf('init().catch'));
 source+='\nglobalThis.audit={setup(c,s,m){cfg=c;session=s;current=m;},reconcilePayment,pending};';
 const records=new Map(),element={textContent:''};
 const context=vm.createContext({...finance,console,AbortSignal,Date,localStorage:{getItem:k=>records.get(k)??null,setItem:(k,v)=>records.set(k,v),removeItem:k=>records.delete(k)},document:{getElementById:()=>element},fetch:async()=>({ok:true,status:200,headers:{get:()=> 'audit-scope'},json:async()=>status})});
 vm.runInContext(source,context,{filename:'reviewed-client-app.mjs'});
 const p={kind:'deposit',code:'audit-match',account:'alice.testnet',hash:'1'.repeat(32)};
 records.set(finance.pendingKey('audit-scope',p.account),JSON.stringify(p));
 context.audit.setup({scope:'audit-scope',paymentsEnabled:true},{account:p.account,csrf:'test'}, {code:p.code,side:0,chain:{state:'AwaitingDeposits',deposited:[false,true]}});
 return {audit:context.audit,element,records};
}
test('EXPOSURE R05: final successful FT rejection/refund leaves all wallet actions blocked',async()=>{
 // A rejected ft_on_transfer can finish successfully via ft_resolve_transfer,
 // returning the stake. It is FINAL success but does not set deposited=true.
 const c=clientHarness({final:true,failed:false});await c.audit.reconcilePayment();
 assert.ok(c.audit.pending());assert.match(c.element.textContent,/unknown or pending/);
});
test('GUARD: exact final transaction failure clears the pending journal',async()=>{
 const c=clientHarness({final:true,failed:true});
 // Clearing calls renderMatch; use no current match for this failure-only branch.
 c.audit.setup({scope:'audit-scope',paymentsEnabled:true},{account:'alice.testnet',csrf:'test'},null);
 await c.audit.reconcilePayment();assert.equal(c.audit.pending(),null);
});
