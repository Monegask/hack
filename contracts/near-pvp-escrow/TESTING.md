# Тестирование

```bash
bash scripts/check.sh
```

Либо отдельные проверки:

```bash
cargo test -p near-pvp-escrow --lib --locked
cargo clippy --workspace --all-targets --locked -- -D warnings
bash scripts/build.sh
cargo test --manifest-path tests/sandbox/Cargo.toml --locked -- --test-threads=1
npm ci --ignore-scripts
npm run check
npm test
```

Сначала собирайте WASM: Sandbox читает файлы из target/wasm32-unknown-unknown/release. Не используйте старый WASM после изменения кода. В CI порядок обеспечивает check.sh.

## Unit

Проверяются обычный матч и реальные FT transfer receipts; 0/3/100% fees и u128 rounding; accepted Raise/revision, отсутствие chain-изменений при rejected proposal и freeze после оплаты; неправильный FT/amount/sender/ID/msg/revision/fee; повторный депозит; один active match; отмена 0/1/2 депозитов; 90/600 секунд, 3-секундная граница с точностью до наносекунды; race start/cancel; неограниченная игра с heartbeat; result authorization/replay; winner/fee/refund failures; параллельный claim и stale/forged callbacks; длинный успешный ответ FT; emergency timeout/refund/result race; невозможность оживить stale match; mutual nonce/forfeit; pause/claims/results; fee/admin snapshots; full admin refund; drained upgrade/migrate; pruning/ID replay; недостаток gas/NEAR и резерв storage для всех сохранённых записей.

Во всех финансовых сценариях проверяется accepted=locked+owed+paid. Callback unit-тесты задают success/failure receipt напрямую; это дополнено настоящим исполнением в Sandbox.

## NEAR Sandbox

Три интеграционных сценария деплоят собранные WASM escrow и standards FT:

1. Фактический ft_transfer_call/resolver (включая wrong amount и duplicate refund), два депозита, start/result, winner+fee FT balances, private callback rejection, result replay, pause+drained deploy+migrate.
2. Незарегистрированный fee_receiver: ft_transfer реально падает, winner получает приз, callback восстанавливает Ready; регистрация+claim завершает комиссию.
3. Незарегистрированный winner: комиссия проходит независимо, регистрация+claim переводит приз; следующая игра проверяет per-match timeout, невозможность revival heartbeat и настоящие emergency refunds.

Sandbox fast_forward изменяет высоту и не гарантирует нужный wall-clock интервал в этой конфигурации. Для аварийного сценария **только timestamp heartbeat тестового матча** старится через sandbox_patch_state; затем contract checks, FT transfers и callbacks исполняются обычными WASM receipts. Точная граница 1800 секунд без patch проверяется в unit test. Тест не ждёт 30 реальных минут. Production/Testnet RPC не имеет этого sandbox метода; контракт не содержит тестового изменения времени.

## TypeScript

`tsc --noEmit` проверяет адаптер кошелька, RPC и полный сценарий. Node tests проверяют decimal->micro-USDC без Number, payload Ready и отклонение изменившихся fee/stake/revision/opponent/participant/deposit flags.

## Testnet

`python3 scripts/preflight.py` проверяет официальную USDC metadata и registration requirements, но не переводит токены. Testnet demo из DEPLOYMENT.md выполняет полный финансовый цикл с собственным совместимым тестовым токеном и ограниченным backend key. Сохранённые `docs/reports` указывают, какие проверки реально выполнены. Не заменяйте Testnet-свидетельство локальными тестами.

Первичный аудит должен дополнительно проверить custom Circle gas/pause/blacklist behavior, максимальную нагрузку, операции ключей, сценарии остановки callback инфраструктуры, обновления схемы и независимый review всех финансовых путей. CI не является аудитом.
