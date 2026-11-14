# Escrow v2 backend/frontend integration · 14 ноября 2026

Результат: versioned adapter фактического Rust API из PR #1 реализован и проверен на настоящих локальных NEAR Sandbox receipts. Mainnet financial endpoints остаются hard-disabled; это готовность к review кода, не production approval.

## Зафиксированные исходники и свидетельства

- База: testnet-pvp-server / `0e13688`; рабочая ветка feat/mainnet-integration, отдельный worktree publishing/mainnet-integration; [PR #3](https://github.com/Monegask/hack/pull/3).
- Contract API pin: `6b6cd1c2f71dead588bbd41e400da9403bc599f8` / [PR #1](https://github.com/Monegask/hack/pull/1); state_version=2. Контрактный worktree не изменялся.
- Проверенный code/build SHA: `7e2001d48f0cb2cba4025c826f67d29f2a5d094b`.
- [Финальный успешный CI](https://github.com/Monegask/hack/actions/runs/43575894085): Linux / Node 24 / near-workspaces 0.24.0, job132389928589. [JSON artifact](https://github.com/Monegask/hack/actions/runs/43575894085/artifacts/14106058612), ZIP SHA256 `01e44b8c4b0e5669df99db6264206f806c33b763caa905a83bd6103f020d8b46`.
- Предыдущий полный успешный прогон [43575384930](https://github.com/Monegask/hack/actions/runs/43575384930) на04c9be1 также сохранён; итоговый7e добавляет truthful public-key metadata, дополнительные regression и conservation evidence.

## Проверки

| Проверка | Результат |
|---|---|
| Backend `node --test pvp/tests/*.test.mjs` | 48/48 локально и в Linux CI |
| Browser `node pvp/tests/browser-finance.mjs` | PASS, изолированные Edge profiles |
| Game `node --test tests/*.cjs` | 117/117 в этой ветке |
| build-offline.cjs и pvp/build.mjs | PASS, автономный HTML и tracked wallet bundle обновлены |
| Bundle syntax + diff --check | PASS |
| Настоящие JS backend/HTTP → Rust Sandbox финансовые сценарии | 9 блоков, PASS, подробности ниже |

Browser: неоднозначный broadcast, reload, вторая вкладка, reconnect, wallet/deployment change, server journal после очистки localStorage, manual original-hash reconciliation и read-only Mainnet без платёжных кнопок. Browser fixture не выдаётся за реальный wallet/Sandbox прогон; финансовые receipts отдельно проверены Node/Rust harness.

## Настоящий финансовый Sandbox

Компилируется точный Rust из pin PR #1 с sandbox feature: она разрешает локальный mock FT и изменяет init/initial pause. Финансовые lifecycle/receiver/callback/refund методы исполняются настоящим WASM и цепочкой receipts. Это не FakeChain и не real Circle issuance. В production artifact mock-token bypass недопустим.

1. Ограниченный server key: точные receiver/7 методов/allowance; actual FT/native transfer и upgrade отклонены с проверкой permission error, а не произвольного InvalidNonce.
2. Реальный broadcast с потерянным ответом → SQLite owner restart → найден исходный hash; новые signed bytes и второй платёж не создаются.
3. FT self-registration нового Carol: только authenticated account, registration_only, minimum; повтор ID/повторная регистрация не создают вторую storage оплату.
4. HTTP create/bind/activity, два депозита, повторный deposit полностью возвращён настоящим FT resolver, 3s countdown/start, серверный result и реальные 9.7 prize /0.3 fee при 5+5.
5. Fee receiver blocklist заставляет реальный FT callback вернуть Ready; winner остаётся Paid. После restart и устранения причины fee claim выполняет attempt2, winner остаётся attempt1 и второй приз не отправляется.
6. Один принятый депозит → prestart cancel → полный refund первоначальному владельцу, нулевое обязательство оппоненту.
7. Попытка вызвать private on_payout кошельком отклоняется настоящим Rust receipt и не подделывает Paid.
8. Mutual request/reject/re-request/confirm; stale nonce отклоняется; обоим возвращены точные ставки без комиссии.
9. Freeze останавливает worker/result, немедленно разрешает player emergency refunds и завершает все обязательства.

Итоговый actual accounting: accepted=paid=45000000; locked=owed=in_flight=live_matches=0, stored_matches=6. Реальный FT balance escrow=0; сумма балансов четырёх получателей остаётся400000000 micro-FT. Эти суммы относятся только к этому локальному Sandbox, не к Mainnet/Testnet payout пользователя.

Первая normal money история этого target harness намеренно вызывает trusted server finish для проверки финансового result пути; полная engine simulation отдельно покрыта game/backend tests. Агент release/mainnet-v1 дополнительно соединяет полный engine playthrough и disconnect recovery с Rust в своём интеграционном worktree. Его результаты не подменяются нашим target report.

## Исправления, обнаруженные в реальном прогоне

- Новый outbox op теперь сохраняется и сразу broadcast до попытки lookup неизвестного hash. Для resumed signed op сохраняются query original hash и только identical-byte rebroadcast. Не введён небезопасный re-sign после timeout/expiry.
- RPC storage price читается из protocol.runtime_config.storage_amount_per_byte; неверная прежняя mock форма исправлена и запрещена regression-тестом.
- Harness воспроизводит normal worker sync после on-chain отмены перед следующей историей, не ослабляя production admission.
- Payment replay связан с account/deployment/request ID/terms и конкретным escrow match ID; уже resolved запрос не предлагает новую подпись.

## Остаточные блокеры и согласование

API mapping закрыт; несовместимости семи server methods/deposit msg не найдено. Остаются контрактные C1/C2: lost callback может оставить InFlight без proof-repair API; failed FT resolver может оставить unaccounted остаток без authenticated attribution/refund API. Безопасный adapter сохраняет unknown/InFlight, не сбрасывает их по времени и не использует aggregate balance для определения владельца. Hash-less wallet/RPC archival recovery — внешняя C3. [Замечания автору PR #1](https://github.com/Monegask/hack/pull/1#issuecomment-6863168711), подробности CONTRACT_REVIEW-v2.md.

Допуск новых v2 матчей требует ровно300bps общего банка и explicit FEE_RECEIVER_ID; generic schema cap500bps не одобряет другой тариф. Existing refunds/claims используют immutable получателей. 5% cap/48h/6h остаются предложенными audit policy Rust-кандидата.

Переданы immutable SHA агенту release/mainnet-v1 (чат7); его worktree не менялся. Независимый аудит, принятие incident recovery design и проверка разрешений денежных соревнований остаются обязательными перед отдельным production решением. Mainnet endpoints/signing выключены без env override. Реальные deployment/деньги/пользовательские ключи и сохранения не использовались. Wallet redirects/mobile и реальный Circle end-to-end этим Sandbox не проверены.
