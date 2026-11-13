#!/usr/bin/env python3
"""Read-only Circle token observation. No signing, credentials or transaction API."""
import base64
import datetime
import json
import pathlib
import urllib.request

TOKEN = '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1'
RPC = 'https://rpc.mainnet.near.org'


def rpc(method, params):
    assert method in ('status', 'block', 'query')
    req = urllib.request.Request(RPC, data=json.dumps({
        'jsonrpc': '2.0', 'id': 'read-only-audit', 'method': method, 'params': params,
    }).encode(), headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=30) as response:
        body = json.load(response)
    if 'error' in body:
        raise RuntimeError(body['error'])
    return body['result']


def main():
    status = rpc('status', [])
    assert status['chain_id'] == 'mainnet'
    header = rpc('block', {'finality': 'final'})['header']
    block = header['hash']
    account = rpc('query', {'request_type': 'view_account', 'account_id': TOKEN, 'block_id': block})

    def view(method):
        result = rpc('query', {'request_type': 'call_function', 'account_id': TOKEN,
                     'method_name': method, 'args_base64': base64.b64encode(b'{}').decode(), 'block_id': block})
        return json.loads(bytes(result['result']))

    metadata = view('ft_metadata')
    assert metadata['decimals'] == 6 and metadata['symbol'] == 'USDC'
    record = {'observed_at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'read_only': True, 'rpc': RPC, 'chain_id': status['chain_id'], 'token': TOKEN,
              'height': header['height'], 'block_hash': block, 'code_hash': account['code_hash'],
              'metadata': {k: metadata.get(k) for k in ('spec', 'name', 'symbol', 'decimals', 'reference', 'reference_hash')},
              'storage_balance_bounds': view('storage_balance_bounds'),
              'limitations': 'No issuer source-to-deployed-WASM equivalence, registration, transfer, pause/blocklist state or transaction tested.'}
    output = pathlib.Path(__file__).resolve().parent.parent / 'docs/candidate/circle-read-only.json'
    output.write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(record, indent=2))


if __name__ == '__main__':
    main()
