// Read-only public RPC inspection. No wallet, signer, transaction or dependencies.
const rpc = 'https://test.rpc.fastnear.com';
const escrow = 'dev-20261105124711-29870979355191.testnet';
const token = 'dev-20261105124714-71962479239708.testnet';
async function query(params) {
  const response = await fetch(rpc, {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({jsonrpc: '2.0', id: 'hackathon-read-only', method: 'query', params: {...params, finality: 'final'}}), signal: AbortSignal.timeout(20000)});
  if (!response.ok) throw Error(`RPC HTTP ${response.status}`);
  const body = await response.json();
  if (body.error) throw Error(JSON.stringify(body.error));
  return body.result;
}
async function view(account_id, method_name, args = {}) {
  const r = await query({request_type: 'call_function', account_id, method_name, args_base64: Buffer.from(JSON.stringify(args)).toString('base64')});
  return {blockHeight: r.block_height, blockHash: r.block_hash, value: JSON.parse(Buffer.from(r.result).toString())};
}
const matchId = process.argv[2];
if (matchId !== undefined && !/^\d+$/.test(matchId)) throw Error('Pass a decimal escrow match ID, not a lobby invitation code');
const result = {checkedAt: new Date().toISOString(), network: 'testnet', rpc, escrow, token,
  account: await query({request_type: 'view_account', account_id: escrow}),
  config: await view(escrow, 'get_config'), accounting: await view(escrow, 'get_accounting'),
  tokenMetadata: await view(token, 'ft_metadata')};
if (matchId !== undefined) result.match = await view(escrow, 'get_match', {match_id: matchId});
console.log(JSON.stringify(result, null, 2));
