# Финальный targeted review версии 1bf3fd7

Дата заключения: **14 ноября 2026**, Europe/Moscow. SHA: `1bf3fd7d7af9e29112b2d1fc8fc38e640b64d459`. Вывод: **NO-GO для публичного Mainnet с реальными USDC**. Это AI-review точной версии, не независимый профессиональный аудит и не юридическое заключение.

## Область и evidence

Зафиксирован сначала remote head `0ed4ef27e0453a4d2014b5094039df77521f6e07`, затем по переданному immutable target изучен delta до `1bf3fd7`. Собственные detached checkouts находятся в audit worktree/tmp. Product/release checkout, production, ключи и пользовательские сохранения не менялись. Реальные транзакции не подписывались/не отправлялись.

Проверены versioned v2 adapter, mandatory fee/receiver policy, HTTP/direct financial routes, client journal, server intents/replays, финальность receipts/blocks, fresh durable broadcast и сохранение подписанных bytes. Contract inputs `contract/**`, Cargo.toml/Cargo.lock/rust-toolchain.toml **не отличаются** от `6b6cd1c2f71dead588bbd41e400da9403bc599f8` по Git diff. Это проверка исходников; не утверждение deployment/ключевых прав.

Самостоятельные прогоны Windows Node v26.13.0:

- `0ed4ef2`: 68/68 штатных backend tests; 11 audit checks после исправления неполного собственного fixture. Первые fixture failures (missing winner/scope) не являлись findings продукта.
- `1bf3fd7`: **70/70 backend tests**.
- `1bf3fd7`: **13/13 audit checks** в `v2-policy-recovery.test.mjs` + `release-mitigations.test.mjs`, из них один EXPOSURE R08 воспроизводит открытый риск.
- Ещё четыре выбранных проверки прежнего suite: два GUARD и два подтверждения остающихся A03 exposures.

Наши проверки — real local HTTP + actual adapter/reconciler/client function в VM + synthetic receipts/in-memory SQLite. Rust/Sandbox reviewer локально не запускал. Эфемерные подписи штатных тестов не являются реальными финансовыми транзакциями.

## Что подтверждено исправленным

| Направление | Вывод по точным сценариям |
|---|---|
| 300 bps и получатель | `assertAdmissionPolicy` проверяется перед новым create/signing; deposit builder отклоняет match с иной fee или receiver. Это backend admission policy, **не неизменяемое ограничение Rust**: generic contract cap остаётся 500 bps. Уже существующие обязательства можно возвращать при смене admission policy |
| R05, успешный полный resolver refund | Actual client `reconcilePayment` через HTTP v2 и server intent завершается по FINAL success с used amount=0; local journal очищается. Не используется отсутствие deposited или один таймер как доказательство возврата |
| R07, freeze/deadline | HTTP v2 строит immediate emergency refund при свежем heartbeat, если frozen или absolute deadline истёк. Receiver/match/method фиксированы. Source worker перед result/heartbeat проверяет control/refundReason |
| Failed resolver / lagging final block | Неоднозначное состояние сохраняется unresolved; повторный платёж запрещён. Receipt на более высокой высоте, чем final head, не разблокирует journal |
| Intent replay | Тот же ID возвращает original request после изменения chain state; иной match/action/terms отклоняется. Resolved replay не отдаёт новую transaction template. Это защищает идемпотентность; нельзя трактовать template replay как безопасное повторное подписание |
| Durable fresh broadcast | Новые подписанные bytes сохраняются до send_tx; бессмысленный lookup ещё не отправленного hash пропущен. Для существующего signed outbox остаются query/rebroadcast того же hash без re-sign. Lease fencing сохраняется |
| R01/A04/P4-01 | Повторные положительные проверки negative TTL, shared generation, account budget и per-match recovery clock прошли. Broader Sybil/ingress/disconnect policies этим не закрываются |

Mainnet startup/signer и финансовые HTTP/Chain.execute gates остаются hard-off. Read-only v2 views не являются разрешением денежных операций.

## Новый finding R08

| ID | Severity | Статус | Условие и воздействие |
|---|---|---|---|
| R08 | **High** | Воспроизведён на 1bf3fd7 | `GameService.sync()` для v2 сначала полностью ждёт reconcileAll всех старых/live записей, затем heartbeat. Concurrency=4 ограничивает параллелизм, но не время прохода. Длинная очередь expired records + slow RPC задерживает heartbeat честной игры до expiry и вынуждает refund |

Безопасное воспроизведение: 360 разных неоплаченных historical лобби, созданных через обычный GameService; после expiry local capacity освобождена. Далее одна funded playing игра с absolute deadline 6h. Включается настоящий `EscrowV2Adapter.refundReason`. Старые reads возвращаются группами по четыре, каждая группа за **20 simulated seconds**; authenticated ливнес обоих участников обновляется каждую секунду. За 90 групп проходят 1800s. Live игра всё время connected, но match heartbeat не отправлен; при достижении live записи worker переводит её в `refund`, reason `Heartbeat expired`.

Ни один read не подвешен на все 30 минут. 20s моделирует bounded read/retry latency; это virtual-clock regression, **не замер фактического публичного RPC** и не доказательство, что обычный игрок управляет задержкой провайдера. Предпосылки: накопленная очередь и деградация RPC. Накопление старых лобби облегчено открытыми A03/A05; 360 существенно ниже contract MAX_STORED. При другом latency порог очереди меняется: approximately ceil(N/4) × read budget; дополнительные control RPC способны увеличить задержку.

Воздействие — availability/fairness и принудительный refund честной партии, не произвольный вывод/двойная выплата. До Mainnet необходимо:

1. Отделить своевременный контроль/heartbeat live games от полного обхода history/expired/unresolved records; установить wall-time budget и deadline/priority для этой работы.
2. Сохранить fresh freeze/deadline checks: простой перенос heartbeat перед всеми проверками не является достаточным исправлением.
3. Ввести cleanup/keeper, очереди/квоты и backoff; не удалять финансовые обязательства или неизвестный outbox ради скорости.
4. Повторить slow-history regression с постоянно подключёнными игроками; доказать heartbeat margin и корректный stop/refund при настоящем frozen/stale состоянии.

R08 расширяет A03/A05 resource risk конкретным воспроизведением v2. Его нельзя закрыть passing legacy FakeChain load.

## CI точной версии

Проверены через GitHub connector:

| Run | Результат | Граница |
|---|---|---|
| [43496776297 — contract](https://github.com/Monegask/hack/actions/runs/43496776297) | Success: 38 Rust unit +9 Sandbox +3 client, два совпавших production builds | Это GitHub CI, не собственный независимый rebuild; historical v1 остаётся equal:false |
| [43496776248 — release integration](https://github.com/Monegask/hack/actions/runs/43496776248) | Success: Node24/game/backend/replay pipeline | Не подтверждает весь backend→Rust financial flow |
| [43496776244 — backend/Rust Sandbox](https://github.com/Monegask/hack/actions/runs/43496776244) | **Failure**: `Finish your current match first` перед следующей funded игрой | В harness после direct on-chain cancel требуется refresh/reconcile локальной записи. Это похоже на отсутствие вызова штатного worker в тесте, не доказанный денежный exploit; полный E2E run этой версии всё равно не пройден |

Предыдущий `0ed4ef2` интеграционный run43496191829 упал на `Cannot convert undefined to a BigInt`; delta1bf исправляет чтение `protocol.runtime_config.storage_amount_per_byte` вместо неверного root field. Новый результат нельзя переносить на старый SHA. Будущий test-only follow-up должен пройти отдельно; commit из другой feature branch нельзя автоматически считать тем же integrated runtime tree.

Production candidate SHA-256 из contract CI1bf: `a6ebecd0b7f78dad11167b63cffd2fe9c646f307f73ac95dbc62c683ca0d9e91`; Sandbox-only escrow `c13dcb8a3c7e61e8915251e03c2102a3946a43ffcdd25fdbce3d055badd194b1`. Исторический v1 rebuild `62795eacd3a59fd2981c0a7c10262e46da2d47a5a436cd0016394adc8e9ca33f` отличается от tracked8d5814… . Эти значения взяты из CI logs, бинарники reviewer не скачивал/deploy не выполнял.

## Нагрузочные evidence и их предел

В предоставленном `load-50-final.json` длительностью60s все **11 recorded source hashes совпали** с нашим immutable1bf checkout. 50 матчей/100 clients, errors={}, API p95≈28.76ms, command p95≈35.38ms, reconnects100. SHA-256 самого JSON: `4ddb0ef50a4c52f8bee21bccb8a11db064222e70df6138776a046c7e6c9e100b`. Это предоставленный прогон, reviewer самостоятельно сверил hashes, но не повторял нагрузку.

В `load-50-v2.json`300s **не все inputs совпали** с1bf; его нельзя называть exact1bf load. Полные per-file сравнения — `release-1bf3fd7-evidence.json`.

Кроме того, `load/server.mjs` использует **FakeChain без adapter**, cfg не включает adapterVersion. Следовательно, `GameService.sync()` идёт по legacy branch и **не выполняет v2 reconcile-before-heartbeat/control**. Fingerprinting adapter/recovery файла не означает исполнения этих ветвей. Оба load evidence не устанавливают v2 control/RPC/signer throughput, приоритет heartbeat под history backlog, native Circle compatibility или Linux VPS capacity.

## Итоговая severity и обязательные остатки

Подтверждённого нового Critical/произвольной двойной выплаты не заявлено. **High остаются A01 (trusted winner/compromise), A03 funded/cleanup, A08 governance с явной предпосылкой доступа к привилегированным ключам, A09 exact historical provenance, новый R08.** Medium: A05 quotas/retention, A06 unknown/expired operation и missing-hash recovery, A07 утверждённые outage/disconnect правила; broader Sybil/ingress/RPC budgets остаются непроверенными. Callback transfer-success/failed-callback InFlight liveness, real key inventory, operational drills и legal/professional gates не закрыты.

R05/R07 конкретные model/harness reproductions исправлены. Это не утверждение, что все receipt edge cases и реальная Circle реализация проверены: полный integrated Sandbox run текущего SHA failed, а Mainnet financial writes намеренно запрещены.

**Письменный вывод:** адаптер и защита повторов существенно улучшены; policy300/receiver и несколько отрицательных сценариев подтверждены локально. Публичный Mainnet с реальными USDC технически не готов. Нельзя снимать payment/signing gates до устранения R08 и остальных обязательных рисков, полного успешного integration evidence, независимого профессионального аудита и юридического допуска. Положительный targeted retest не является разрешением deployment или расходования средств.

## Воспроизведение

```powershell
$env:AUDIT_PVP_ROOT = (Resolve-Path 'tmp/release-1bf3fd7/prototypes/logistics-race/pvp').Path
node --test security/mainnet-readiness/pr-tests/v2-policy-recovery.test.mjs security/mainnet-readiness/pr-tests/release-mitigations.test.mjs
node --test --test-name-pattern='^(GUARD A03|EXPOSURE A03|GUARD PR4)' security/mainnet-readiness/pr-tests/release-4149986.test.mjs
```

R08 — последний тест первого файла; passing EXPOSURE означает, что проблема воспроизведена. После исправления нужен новый positive assertion на своевременный heartbeat и сохранение connected live game, с отдельными проверками frozen/expired safety. Не запускать tests с production credentials.
