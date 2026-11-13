# Supply Line · native Circle USDC / escrow-v2

Актуализация 13 ноября 2026: фактический Rust API из PR #1 (`6b6cd1c`) интегрирован отдельным versioned adapter. Первоначальная запись о неизвестном API больше не описывает текущее состояние. **Mainnet deployment, реальные деньги и включение финансовых endpoints не выполняются.** Guard не имеет env override; независимый аудит и проверка разрешений денежных соревнований остаются отдельными условиями.

## Конфигурации и совместимость

- Testnet: `.env.example` / `.env.testnet.example`, сеть по умолчанию testnet, старый escrow-v1/WASM/mock FT. В wire API и пользовательской БД v1 нет миграции.
- Mainnet: `.env.mainnet.example`, явные network/origin/RPC/escrow/server/token/code hash/абсолютный DATA_DIR и ESCROW_API_VERSION=2. REQUIRED не является адресом готового deployment. DB scope включает версию adapter; нельзя переиспользовать старую/чужую БД.
- Только [нативный Circle USDC](https://developers.circle.com/stablecoins/usdc-contract-addresses): `17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1`, decimals=6. USDC.e и подмены по symbol отклоняются.
- Preflight v2 проверяет chain_id, pinned code hash, schema/state_version=2, immutable token/roles, metadata и FT registration escrow/fee receiver. Config/code читаются на одном final block. Initially paused и server_frozen показываются read-only; допуск матчей при них закрыт.
- SERVER_KEY_FILE в Mainnet запрещён. Опциональный **публичный** SERVER_RUNTIME_PUBLIC_KEY позволяет read-only проверить exact receiver/7 methods/finite allowance; это не загрузка signer и не разрешение транзакций. Необозначенная проверка возвращает signerChecked=false.
- NEP-413 подписывает сеть/escrow/origin/одноразовый challenge; FullAccess ключ проверяется в выбранной сети. При смене deployment API responses отвергаются до reload. Сеть не выбирается параметром URL.

## Adapter и финансовый lifecycle

`server/adapters/escrow-v2.mjs` содержит строгую схему, точные server/player transaction builders и refund eligibility. Backend Chain/GameService используют create/bind/activity/heartbeat/start/result. Начальные game states сохраняются до start; client victory не принимается как денежный результат. Scope и старый v1 branch отделены. Сводная карта API: ESCROW_API_REQUIRED.md.

До deposit проверяются текущие участники/stake/revision/fee, registry/balance USDC, spendable NEAR и FT storage escrow/обоих игроков/фиксированного fee receiver. Self-registration использует minimum storage, registration_only и текущий authenticated account. Native reserve 0.01 NEAR — консервативная политика допуска, не цена gas. Расчёт liquid NEAR вычитает storage_usage × storage_amount_per_byte; staking collateral не засчитывается. Конкурентные траты/изменение gas всё ещё могут вызвать отказ.

Player deposit использует 150 Tgas и 1 yoctoNEAR; cancellation/forfeit/claim — 250 Tgas и 1 yoctoNEAR по API v2. Комиссия и приз вычисляются целочисленно; fee/receiver snapshots не подменяются текущим admin config. UI отдельно показывает принятую сумму депозитов, банк/fee, effective/pending fee и реальные Ready/InFlight/Paid. Cancelled не означает, что все refunds доставлены.

Mainnet `requirePayments` блокирует create/join/deposit/register/claim/refund/forfeit и публичные lobbies; worker и signer не запускаются. Read-only `/api/escrow/matches/:id` доступен только участнику/получателю выплаты. Подготовленные builders исполняются интеграционным harness только в локальном Sandbox — environment config такой режим не разрешает.

## Неизвестная wallet-транзакция

Сервер сохраняет immutable `payment` intent до передачи transaction в browser; ключ — deployment/account/request ID. Один unresolved intent блокирует следующий, в том числе с другого устройства. Web Locks и localStorage дополняют серверный журнал. `GET /api/payments` восстанавливает его после потери browser storage; `POST /api/payment-status` принимает ID и исходный hash из кошелька. Hash и transaction binding проверяются до сохранения; другой signer/receiver/args/deposit не принимаются. Нельзя заменить уже проверенный hash.

Reconciliation проверяет FINAL и весь receipt tree, затем escrow на final block >= высот всех receipts. Для deposit receipt-linked deposit_accepted + accepted final state подтверждают приём; amount-used=0 успешного FT resolver подтверждает полный возврат; root token receipt Failure до transfer означает атомарный отказ. Failure resolver после transfer не трактуется как возврат. Баланс всего escrow не используется для приписывания депозита.

Для claim факт top-level success не равен Paid. Ready после завершённых receipts даёт безопасный retry фиксированного обязательства; InFlight остаётся заблокированным; Paid подтверждает доставку. Cancel/result означает создание обязательств, а не доставку всех переводов. Unknown tx/hash без final evidence не сбрасывается по таймауту. Кнопка «Check original transaction hash» позволяет проверить исходный hash из wallet history. Если hash отсутствует, приложение не может доказать отсутствие broadcast; автоматический повтор запрещён.

Server signed outbox после restart использует тот же hash/bytes; даже frozen/paused не создаёт замену. До broadcast проверяется SQLite lease; `chainTime` coalesces reads на 250ms и evicts failure. Code-hash mismatch останавливает выполнение, а refund states при freeze/абсолютном deadline переводят worker в refund и исключают winner/result/heartbeat.

## Ограничения контракта до production

См. CONTRACT_REVIEW-v2.md: у v2 нет proof-based восстановления потерянного payout callback или безопасного возврата unaccounted FT после failed resolver. Полный автоматический recovery во всех случаях не реализован ни контрактом, ни adapter. Runtime — централизованный winner oracle; FunctionCall key не может произвольно переводить FT/NEAR, но компрометация сервера всё ещё позволяет выбрать нечестного победителя среди участников. FullAccess deployment/admin и Circle issuer — отдельные доверенные роли.

## Проверки и локальные команды

```powershell
npm ci
npm test
npm run test:finance-ui
node ../build-offline.cjs
node ../game-3d/build.mjs
node ../bot/build-race.cjs
npm run build
```

Для 3D build нужны зависимости `../threejs-trial`. Browser tests используют изолированные профили, не трогают пользовательский save.

Workflow `.github/workflows/escrow-v2-integration.yml` берёт PR #1 по **точному SHA**, компилирует Rust с sandbox feature, запускает near-workspaces 0.24.0 и реальную JS backend/HTTP цепочку. Sandbox WASM и ephemeral keys не используются в Mainnet; ключи временных аккаунтов остаются в private temp file runner и не попадают в artifacts. Отчёт содержит только публичные receipt/ledger данные. Итоговые результаты и границы фиксируются в VALIDATION-escrow-v2.md.

Автодеплой Vercel для feat/mainnet-integration отключён branch-specific настройкой vercel.json. Railway/Mainnet не развёртываются. [Vercel configuration](https://vercel.com/docs/project-configuration/git-configuration), [wallet login](https://docs.near.org/web3-apps/tutorials/wallet-login), [NEP-141/145](https://docs.near.org/primitives/ft/standard).
