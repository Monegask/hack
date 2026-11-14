# Reproducible PvP load tests

Run from repository root on Node 24+. Install the PvP package with `npm ci` first.
These tools create fresh temporary SQLite WAL databases and simulated sessions.
They never read credentials, load `.env`, sign transactions, or reset browser saves.
Temporary DB paths are retained for inspection; remove only those test paths when finished.

```powershell
node prototypes/logistics-race/pvp/load/export-baseline.mjs 0e13688
node prototypes/logistics-race/pvp/load/run.mjs --server-dir=prototypes/logistics-race/pvp/.baseline-server --seconds=60 --label=baseline --out=tmp/baseline.json
node prototypes/logistics-race/pvp/load/run.mjs --seconds=60 --label=candidate --out=tmp/candidate.json
node prototypes/logistics-race/pvp/load/determinism.mjs 50
node prototypes/logistics-race/pvp/load/routes.mjs
node prototypes/logistics-race/pvp/load/admission.mjs
```

Defaults: 20, 50, 100, 200 simultaneous matches, two clients per match,
250 ms full-state polling, one command per player every 2 seconds followed by
an identical retry. Both sides send legal material missions. This is an early-game
transport and command scenario, not a late-game soak with many trucks.
Setup concurrently creates and joins all lobbies, simulates confirmed deposits,
and starts each match through GameService. Simulated RPC methods wait 5 ms;
`--rpc-ms=100` changes this delay. The fixture does not model signer nonce,
gas, throughput, network rejection or FT callbacks. Existing durable-outbox tests
exercise ambiguous broadcasts separately. This load test proves no on-chain capacity.

`--reconnect=true` closes and reopens all client connections halfway through the run.
`--matches=50 --seconds=600` runs a longer single tier. `--metadata=true` isolates
menu-only payload cost, not an active game's polling cost. `--profile=tmp/profiles`
records the child CPU profile (create directory first). Windows `--affinity=15`
pins the child to four logical CPUs; this is not a 4-vCPU VM or an 8-GB memory limit.
Child V8 old space is capped at 6144 MB; RSS includes other allocations.

The controller is a separate process. Each user has a distinct loopback source IP
so the baseline's 45 requests/IP/second guard stays enabled. Use loopback aliases
only on hosts that support them. An ECONNREFUSED result is a failed run, not a
discarded sample. The controller repeats uncertain command IDs/sequences on its
next command opportunity; the gameplay client retries immediately with backoff.

For an actual combined 4 CPU / 8 GB cgroup run on a Linux Docker host:

```sh
docker build -f prototypes/logistics-race/pvp/load/Dockerfile -t supply-line-load .
docker run --rm --cpus=4 --memory=8g --memory-swap=8g \
  -v "$PWD/bench-results:/results" supply-line-load \
  --seconds=600 --out=/results/4cpu-8gb.json
```

The combined container limit includes controller and server (conservative compared
with separate load hardware). Use a named volume at `/tmp` to compare persistent
disk rather than a container writable layer. No production volume or signer mount.
The Docker recipe has not been executed on the Windows measurement host.

`rpc-readonly.mjs` is an optional, separately invoked 12-read probe against the
public Testnet endpoint. It does not run during the load test. Its latency includes
the local network path; it is not a provider capacity benchmark.

Results include API/command p95, errors (including transport errors), observed
accepted command counts, CPU, peak RSS, event-loop delay, checkpoint/tick costs,
simulation drift and backlog, SQLite writes and mock RPC calls. A run passes only
when errors are zero, command counts match, API **and command** p95 are below
500 ms and maximum observed simulation delay/backlog is below 250 ms.
The full-game deterministic replay is a separate correctness gate. No test here
justifies raising the public server cap automatically.

## Explicit v2 scheduling run

Use `--adapter=v2 --matches=50 --seconds=300 --reconnect=true` to execute the
v2 service control/heartbeat/background scheduler with schema-validated fake
config/match views. The result requires `v2BranchExercised: true` and positive
`simulationMetrics.v2SyncCycles`. Default `--adapter=v1` remains the independent
Testnet path. Older reports without this marker do not establish v2 execution.

Both modes use mock chain transport and simulated deposits. The v2 mode does not
measure real RPC, restricted-key signing/nonce throughput or FT callbacks. Those
are separate Rust Sandbox correctness scenarios; production throughput remains
unverified. Source and load-fixture hashes are recorded for each new run.
