# Повторный review PR — 13 ноября 2026

Статус: **NO-GO**, анализ обновляется по полученным PR. Это AI-review, не независимый профессиональный аудит.

## Зафиксированные версии

| Направление | PR | Проверенный head | Основание |
|---|---|---|---|
| Контракт | [#1](https://github.com/Monegask/hack/pull/1) | `2cee8bcb255a6b18fe612da3e6f51f4198a29212` | Fetch PR head, чтение Rust/API/workflow/Sandbox; GitHub CI |
| Контракт, повторное обновление | [#1](https://github.com/Monegask/hack/pull/1) | `fa99661f9c6bc0359f65052ca5ffb533fd07bb21` | Delta review; CI run 43432969319 success; 38 unit + 9 Sandbox + 3 client |
| Матчмейкинг | [#2](https://github.com/Monegask/hack/pull/2) | `079c2cb9013da1cd08c9dde992904e778c79807a` | Fetch PR head; чтение полного backend/client diff; локальный suite |
| Mainnet-интеграция | [#3](https://github.com/Monegask/hack/pull/3) | `fa7a91e051cab067b3122990fa76b2aab4b20ec2` | Получен PR; чтение config/chain/HTTP/client/finance/tests; 43 локальных backend tests |

База — `0e13688f559b0807b334c7e963b938d0107d0959`. В отдельном временном detached worktree `tmp/pr-validation` взят head #2 и применены изменения #1 без production merge. Этот checkout — проверочная композиция, не релиз. Audit branch сохраняет базовый runtime и добавляет только отчёты/тесты/исходный snapshot.

## PR #1 — escrow

`freeze_server` немедленно запрещает все методы, использующие `assert_server`, включая result/heartbeat. Emergency refund допускается при frozen server без ожидания 30 минут. Это исправляет A02 по чтению source и усиливает независимый выход при compromised signer; обычный `pause` намеренно сохраняет results/claims/heartbeat. Runbook должен различать pause и freeze.

Введены game deadline, fee cap и отложенное изменение fee. 6 часов / 5% / 48 часов — предложенные параметры кандидата, не утверждённые пользователем требования. Game deadline позволяет выйти даже при исправно отправляющем heartbeat злонамеренном сервере, но A01 сохраняется: сервер по-прежнему может назначить любого участника победителем до deadline.

Production constructor закрепляет token ID и стартует paused; Sandbox feature даёт отдельный bypass для mock FT. Unit-test build также отключает pin, поэтому важен отдельный тест production WASM initializer. Источники возвращены в Git, добавлены pinned lock/toolchain, source provenance и сборка двух production WASM с byte comparison. Это прогресс по A09; независимая source→WASM проверка ещё нужна.

Проверен [CI run 43431414548](https://github.com/Monegask/hack/actions/runs/43431414548), job `131905561324`: success, 38 unit tests, 7 Sandbox tests и 3 client tests. Из логов: production SHA-256 `ed4363ce5d39a97559c7cfab170ced624aa719785ee444734057bd03dedd6e5e`, Sandbox escrow `047e2d9858e899b790bc2f518d9e76a5f8941f0d9b74c60dfcdaa46bec0d7f6e`. Artifact ID `14038968934`, ZIP digest `b272966b63686dd781f5fa8618fdbc090046c1b6cbc8652ae86854df13b432f1`. Эти hash взяты из CI, бинарники данным review не скачаны/не пересобраны и не сравнивались с chain. Старый Testnet WASM остаётся отдельным артефактом.

CI checkout — synthetic merge `b9e190fdfc66efbd472cac6c1d3ab195b75b8544`. Важная оговорка: шаг Format вызывает `cargo fmt` с записью, а `git diff` только печатает изменения и возвращает success. По логам build/test выполнялся после изменения исходников rustfmt. Результат привязан к merge+форматированию, а не к byte-exact исходникам head. Это не доказанная подмена семантики, но release provenance необходимо исправить.

Source v2 добавляет поля Config/Match. `migrate` читает Self v2, а не переводит v1. Нельзя обновлять старый Testnet state таким WASM. Для нового Mainnet account это fresh deployment; для существующего state нужна отдельная audited migration. ABI views расширен, freeze/deadline должны поддерживаться backend и UI.

## PR #2 — каталог и Join

Проверены allowlist query fields, bounds pagination/filters, private default для legacy, минимальная публичная проекция, fresh chain state перед Join, повторная проверка seat/account после await, сохранение reservation до chain bind. Непосредственного пути в чужой payout, обхода membership или двойного занятия места в рассмотренных interleavings не найдено. Каталог не подписывает транзакции.

На композиции #1+#2 прошли 36 backend tests: 27 штатных + 9 audit tests базы. Денежная chain часть JS остаётся FakeChain, контракт этим прогоном не исполняется. Отдельные PR attack tests находятся в `pr-tests/matchmaking-attacks.test.mjs`.

## Delta findings и обязательные действия

| ID | Severity | Результат повторного review | Исправление / gate |
|---|---|---|---|
| A01 | High | Открыт; trust in winner неизменен, бесконечное удержание ограничено deadline кандидата | Решение по trusted referee/dispute, независимые replay/evidence и лимиты средств |
| A02 | High в базе | Исправлен source-дизайном freeze; CI включает freeze/result/heartbeat/refund | Проверить backend/UI заморозки и релизный exact WASM; не заменять freeze обычным pause |
| A03 | High | Подтверждён повторно: expired лобби скрываются из каталога, но capacity не освобождают | Final cleanup и Sybil admission до публичного Mainnet |
| A04–A07 | Medium | Остаются в backend #2 | Proxy/account limits, bounded retention, outbox reconciliation, outage rules |
| A08 | High / условный | Fee cap/delay улучшают admin risk; FullAccess governance и actual keys не проверены | Access-key inventory и независимый governance review |
| A09 | High в базе | Источники/CI добавлены, частично закрыт; provenance caveat R02 | Exact source→release WASM, независимый rebuild, правильный artifact selection |
| R01 | Medium | Каталог читает **все** подходящие on-chain лобби до pagination, на каждый последовательный запрос. In-flight coalescing не является TTL-cache или upstream quota; 8 лобби × 5 запросов limit=1 дают 40 чтений | Bounded shared cache/index, freshness budget, concurrency+RPC quotas, исключить влияние discovery на settlement/heartbeat |
| R02 | Medium | CI форматирует source перед build и не требует clean tree | `cargo fmt --check`, чистый immutable checkout, artifact manifest с tested merge/head/source hash; отдельный provenance и независимый rebuild |
| R03 | Medium | Generic `scripts/build.sh` пишет production-конфигурацию в путь исторического Testnet WASM; Sandbox tests требуют Sandbox artifact, но generic `check.sh` вызывает старый build path | Единая явная production/Sandbox pipeline, запрет перезаписи архивного WASM, tests по явно названным артефактам. Проверить документацию и скрипты совместно |
| R04 | Low | API/SECURITY/DEPLOYMENT пока описывают старые fee/pause/state рядом с v2 source | Переписать документы под финальный ABI; draft notes не являются готовой инструкцией оператора |

Параметры `game_deadline_ns`, `server_frozen`, pending_fee и state_version=2 требуют явных тестов композиции: freeze сразу после heartbeat, freeze/result в обратном порядке, player refund до heartbeat timeout, absolute deadline при свежем heartbeat, независимые от сайта выплаты. Граница «result уже final до freeze» не может отменяться задним числом без новой архитектуры dispute.

## Воспроизведение PR attack tests

В audit worktree, PowerShell:

```powershell
$env:AUDIT_PVP_ROOT = (Resolve-Path 'tmp/pr-validation/prototypes/logistics-race/pvp').Path
node --test security/mainnet-readiness/pr-tests/matchmaking-attacks.test.mjs
```

Это только local fixture и in-memory SQLite. Не устанавливать переменную на production directory с секретами; никакие signer/preflight/deployment скрипты не требуются.

## Вывод после полученных PR

#1 исправляет существенный emergency-control пробел и делает контракт проверяемым в Git; #2 добавляет корректную базовую защиту гонки Join. Вместе они пока не закрывают дешёвый DoS capacity, нагрузку discovery, доверенный результат, governance и ограничения восстановления. Финальный review Mainnet-интеграции и композиции трёх PR ещё не выполнен. Техническая готовность к реальным USDC не подтверждена.

## Следующий срез: обновлённый #1 и полученный #3

Предыдущие разделы сохраняют первый проверенный срез. После него fetch #1 обновлён до `fa99661f9c6bc0359f65052ca5ffb533fd07bb21` (промежуточный `9ce99b7720d1a8d1408a4506686ba5ed37d16c02`). Прочитан delta обоих обновлений, candidate SPEC/MIGRATION/RISKS/VERIFICATION, production initialization и build scripts. Изменения: self-only production init, расширенные issuer-failure tests, `cargo fmt --check`, корректный build.sh wrapper, отключённый старый deploy-testnet script, обновлённые API и явно помеченные исторические документы. Поэтому R02/R03/R04 **исправлены по source**; старые findings выше не считать открытыми для этого head. Независимый rebuild и актуальный successful CI остаются отдельными gates.

Run [43432643214](https://github.com/Monegask/hack/actions/runs/43432643214) на `9ce99b7` прошёл unit/lint, но упал на `AssertionError: Cargo.lock` в verify-origin. Новый head исправляет обработку смешанных LF/CRLF. Run [43432969319](https://github.com/Monegask/hack/actions/runs/43432969319) проверяется отдельно; успех run 1 нельзя переносить на текущий source. Новые production hash до завершения актуальной проверки не утверждаются этим отчётом.

PR #3 — **подготовка конфигурации**, а не работающая Mainnet денежная интеграция. Проверены явные network/token/escrow/hash/DATA_DIR, привязка БД и NEP-413 challenge/session к deployment scope, проверка RPC chain_id, integer суммы, FT registration и spendable NEAR. Mainnet запрещает SERVER_KEY_FILE, Chain.execute/match и финансовые HTTP paths; `main.mjs` не создаёт Mainnet GameService. Нет включающего write-флага. Эти блокировки должны сохраниться до отдельной проверенной интеграции, а не считаться проблемой, которую следует снять ради запуска.

В отдельном detached `tmp/pr3-validation` на exact head #3 прошли 43/43 JS tests (34 штатных + 9 audit tests). Только моки/loopback, Node v26.13.0. Дополнительно прошли 2 теста v2 refund compatibility (frozen/deadline) на существующем Testnet adapter и 2 теста actual client reconciliation через controlled VM harness, без wallet/RPC. Они воспроизвели R05 и проверили противоположный случай final failed tx. Нет доказательства live Circle transfer/refund из этого harness.

Найденные дополнительные проблемы и границы:

| ID | Severity | Результат | Требуемое исправление |
|---|---|---|---|
| R05 | Medium | FINAL successful rejected/refunded `ft_transfer_call` не ставит deposited=true и не является top-level Failure. `reconcilePayment` оставляет journal навсегда и `pending()` запрещает все следующие wallet actions, включая cancel/claim | Различать pending, accepted, rejected+fully returned, resolver failure и success без payment effect. Проверять final receipts/match/FT evidence; не снимать блокировку только по timeout или отсутствию депозита |
| R06 | High, release blocker | Три PR не образуют проверенный интеграционный релиз. Попытка cherry-pick #3 в композицию #1+#2 дала конфликты .gitignore, client/app.mjs, public/app.js, server/http.mjs. Mainnet ABI намеренно не подключён | Отдельный integration SHA, semantic conflict resolution с сохранением финансовых gates и matchmaking, regeneration bundle, полный retest. Это не утверждение удалённой финансовой уязвимости уже работающего Mainnet |
| R07 | Medium, integration gap | Воспроизведено двумя HTTP-тестами с v2 fixtures: старый service/HTTP/client знают только heartbeat+30m. Новый freeze_server и game_deadline_ns могут разрешать refund раньше, но UI/transaction builder этого не учитывают | Versioned adapter, live config/frozen status, absolute-deadline handling, независимый exit. Mainnet gate пока предотвращает использование неполной реализации |

R05 безопасно воспроизводится так:

```powershell
$env:AUDIT_PVP_ROOT = (Resolve-Path 'tmp/pr3-validation/prototypes/logistics-race/pvp').Path
node --test security/mainnet-readiness/pr-tests/payment-attacks.test.mjs security/mainnet-readiness/pr-tests/v2-refund-attacks.test.mjs
```

Для объединения использовалась исключительно собственная временная копия: #2 head плюс изменения #1 head `fa99661`, synthetic local commit `687a934`. Конфликтный cherry-pick #3 отменён; чужие ветки не менялись. Ни один полный тест не заявляется как пройденный на несуществующей разрешённой композиции трёх PR. Возвращать runtime код в audit branch ради формального зелёного теста не стали.

Текущий письменный вывод после повторного review **всех трёх полученных PR**: **NO-GO для публичного Mainnet с реальными USDC**. Emergency contract control улучшен, источники/CI появились, сетевые блокировки работают в локальных mocks; сохраняются A01/A03–A08, R01/R05 и неподготовленная композиция R06/R07. Нужны закрытие обязательных исправлений, независимый профессиональный аудит и юридический допуск. Этот вывод не означает, что PR #3 должен включить платежи: его сохранённая блокировка соответствует состоянию проекта.

## Финальное CI evidence текущего проверенного #1

В 16:30 МСК 13 ноября подтверждён success [run 43432969319](https://github.com/Monegask/hack/actions/runs/43432969319) на head `fa99661`: 38 unit, 9 Sandbox scenarios, 3 client tests, pinned toolchain/lints, clean format checks и byte comparison двух production builds. Tested merge начинается `f371f21`. Логи/manifest excerpt сохранены в `ci-pr1-final-evidence.json`. Это проверенные результаты GitHub CI; независимого локального Rust rebuild reviewer не выполнял.

| Артефакт | SHA-256 из CI |
|---|---|
| Новый production candidate | `ea4ac663d1941e1bc5dc1edf8bbf821ba3a9920b1c34a68a70c2eab15fb1b2fc` |
| Sandbox-only escrow | `a19c89de129b7bc1aa515d5c7b3dd677a293d987f15c775474f7ac0da8e35576` |
| Сохранённый старый Testnet WASM | `8d581487374ce5f59935deb3710c952cfdda07ef9f9c9a8cd366716fb8f74d77` |
| Пересобранная из восстановленных исходников v1 | `4b36159ca1e23ae7a00e3b3bab196a3a094920d3494543678a3bbc19a8aee763` |

**Старый v1 WASM не воспроизведён: `equal:false`.** При этом проверка хешей реконструированных production-source inputs прошла. Возможные причины различия build environment/paths/flags ещё не установлены; mismatch нельзя объявлять доказательством вредоносного бинарника или идентичности поведения. Для старого опубликованного/работающего Testnet WASM A09 остаётся открытым provenance finding. Его source-only review нельзя выдавать за полный review exact deployed bytes.

Artifact `14042940209`, ZIP digest `0cd55b52e265b34d28279c2bd0644a81f5eaf20b0115479df125c095787c877b`. Артефакт не скачан/не deployed этим reviewer. Успех CI не закрывает A01, A03, A08, R05–R07 и не меняет NO-GO. Два воспроизводимых candidate builds в CI — полезное evidence, но независимый rebuild, exact release composition и профессиональный аудит ещё обязательны.
