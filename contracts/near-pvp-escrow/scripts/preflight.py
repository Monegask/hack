#!/usr/bin/env python3
"""Read-only Testnet FT preflight. No secrets, signing or value transfers."""
import argparse,base64,json,urllib.request
CIRCLE_TESTNET='3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af'
p=argparse.ArgumentParser()
p.add_argument('--rpc',default='https://rpc.testnet.near.org')
p.add_argument('--token',default=CIRCLE_TESTNET)
p.add_argument('--accounts',nargs='*',default=[])
p.add_argument('--output')
a=p.parse_args()
def rpc(method,params):
    req=urllib.request.Request(a.rpc,data=json.dumps({'jsonrpc':'2.0','id':'escrow-preflight','method':method,'params':params}).encode(),headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(req,timeout=25) as r: obj=json.load(r)
    if 'error' in obj: raise RuntimeError(obj['error'])
    return obj['result']
def view(method,args):
    r=rpc('query',{'request_type':'call_function','account_id':a.token,'method_name':method,'args_base64':base64.b64encode(json.dumps(args).encode()).decode(),'finality':'final'})
    return json.loads(bytes(r['result']))
status=rpc('status',{})
if status['chain_id']!='testnet': raise SystemExit('Refusing a non-Testnet RPC')
meta=view('ft_metadata',{})
if meta['decimals']!=6 or meta.get('spec')!='ft-1.0.0': raise SystemExit('Expected compatible 6-decimal NEP-141 token')
report={'network':status['chain_id'],'block_height':status['sync_info']['latest_block_height'],'block_time':status['sync_info']['latest_block_time'],'token':a.token,'metadata':meta,'storage_bounds':view('storage_balance_bounds',{}),'accounts':{x:{'registration':view('storage_balance_of',{'account_id':x}),'balance':view('ft_balance_of',{'account_id':x})} for x in a.accounts}}
text=json.dumps(report,ensure_ascii=False,indent=2)
print(text)
if a.output:
    with open(a.output,'w') as f:f.write(text+'\n')
