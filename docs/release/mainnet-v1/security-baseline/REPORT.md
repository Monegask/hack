# Supply Line — Mainnet readiness security review

Дата: 13 ноября 2026. Статус базовой версии: **NO-GO для публичного Mainnet с реальными USDC**.

Это самостоятельный технический AI-review реализации, а не независимый профессиональный аудит. Наличие тестов, старых Testnet receipts и этого отчёта не является разрешением запускать реальные деньги.

## Проверяемая версия и границы

- Репозиторий: https://github.com/Monegask/hack; base `testnet-pvp-server`, SHA `0e13688f559b0807b334c7e963b938d0107d0959`. `git fetch origin testnet-pvp-server` выполнен; remote совпал с SHA базы.
- Отдельный worktree `publishing/audit-mainnet-readiness`, ветка `audit/mainnet-readiness`. Реализация игры, production, ключи и deployment не менялись. Финансовые транзакции не подписывались и не отправлялись. Локальные тесты используют только моки, in-memory SQLite и loopback HTTP; штатные тесты используют также эфемерные тестовые подписи.
- В Git базы есть только `contracts/near-pvp-escrow/artifacts/near_pvp_escrow.wasm`. Публичных Rust-исходников и воспроизводимой сборки базы нет.
- Для анализа Rust взят неизменённый архив импорта 5 ноября. Все 53 файла совпали с исходным импортным реестром SHA-256. Выбранные build inputs и mock FT сохранены в `baseline-contract/`; исходный архив не пересобирался. Проверка — `import-verification.json`.
- SHA-256 WASM базы и WASM архива: `8d581487374ce5f59935deb3710c952cfdda07ef9f9c9a8cd366716fb8f74d77`. Совпадение файлов **не доказывает**, что бинарник собран именно из этих Rust-исходников. Rust findings относятся к сохранённому source snapshot; поведение deployed WASM здесь не подтверждалось.
- Cargo/rustup/NEAR Sandbox недоступны в текущем Windows окружении. Новые Rust attack tests добавлены, но **не скомпилированы и не выполнены**. Старые результаты Rust/Sandbox не засчитаны как текущий прогон. Нагрузочные выводы ограничены локальными воспроизведениями.
- On-chain права Mainnet deployment/admin/server и наличие FullAccess не проверялись. Секреты не читались. Production access logs, инфраструктура, резервные копии и incident-response практики не инспектировались.
- Последующие PR анализируются отдельно в `PR-REVIEW.md`; исправления кандидатов не меняют вывод о старой базе.

## Архитектура и модель доверия

```text
Wallet -- NEP-413 --> HTTP session + CSRF
Player -- validated commands --> GameService --> server simulation + SQLite snapshots
Wallet -- ft_transfer_call --> fixed FT --> escrow.ft_on_transfer
GameService --> durable signed outbox --> restricted server key --> escrow
escrow --> FT ft_transfer --> private callback --> Paid / Ready
admin --> pause / refunds / fee / drained upgrade
deployment account FullAccess, if retained --> arbitrary replacement WASM
```

`server/game.mjs` разрешает только игровые команды, проверяет территорию и типы. Клиент не передаёт доверенный `won`, время, ресурсы или получателя выплаты. `service.mjs` самостоятельно тикает движок, выбирает победителя и сохраняет состояние. Это защищает от обычной подмены браузера, но не от компрометации backend, SQLite, поставки кода или server signer.

Escrow не исполняет игру, не проверяет replay команд и не имеет оспаривания результата. Он проверяет, что результат прислал `cfg.server`, а победитель — один из двух участников. Соглашение «сервер честен» является денежной границей безопасности.

Severity оценивает воздействие и условия атаки: Critical — произвольная потеря/перенаправление средств при доступной границе; High — существенный денежный риск или дешёвая блокировка публичного сервиса; Medium — ограниченный DoS, потеря доступности/справедливости или восстановления; Low — дополнительное усиление защиты. Условия компрометации явно указаны; они не выдаются за найденный удалённый взлом.

## Таблица findings

| ID | Severity | Статус / условие | Проблема и воздействие | Evidence | Обязательное действие |
|---|---|---|---|---|---|
| — | Critical | Подтверждённых нет | Не обнаружен доступный обычному игроку путь произвольного вывода или двойной выплаты. Это не доказательство отсутствия таких путей. | Ограничения review выше | Профессиональный аудит и Sandbox остаются обязательными |
| A01 | High | Подтверждённая модель доверия; нужен server key/backend compromise либо нечестный оператор | Любой участник может быть объявлен победителем без игровых доказательств. Злоумышленник играет своим кошельком и получает чужую долю; также способен обновлять heartbeat бесконечно и мешать timeout refund. | `baseline-contract/contract/src/settlement.rs:5`, `matches.rs:154`; JS `EXPOSURE A01` | Ограничить TVL/ставку/длительность, разделить signer и игровой процесс, подписываемый журнал/replay, решение по dispute/independent settlement validation. Остаточный риск доверенного судьи должен быть явно принят владельцем до денег |
| A02 | High | Подтверждено по исходникам; runtime Rust test не выполнен | Pause не останавливает `submit_result` и heartbeat. `set_server` требует полного drain: нельзя немедленно отозвать роль при активных матчах. Украденный signer может продолжать settlement после pause и соревноваться с admin refund. | `admin.rs:5,40`, `settlement.rs:5`, `matches.rs:154`; исходный тест `pause_blocks_activation_and_deposits_but_not_refunds_results_or_claims`; новый Rust exposure | Отдельный emergency revoke/freeze server authority во всех денежных server methods, доступный при активных матчах; возвраты/claims сохранить; тест revoke-before-result и обратного порядка |
| A03 | High | Воспроизведено локально, открытая регистрация аккаунтов | Неоплаченные истёкшие лобби навсегда занимают `maxActive`. Достаточно 10 аккаунтов при default, без FT-депозита. Backend продолжает polling, но не вызывает permissionless `cancel_expired_lobby`; локального deadline eviction нет. | `server/service.mjs:9,15,108`; `EXPOSURE A03` | Автоматическая final-сверка и permissionless cleanup истёкших on-chain лобби, квоты/стоимость создания, защита от Sybil и ограничение числа pending creates; не освобождать слот финансово активной игры только по локальным часам |
| A04 | Medium | Воспроизведено; общий remoteAddress за reverse proxy | Все пользователи за одним proxy/IP делят 45 API-запросов/сек. Один клиент блокирует остальных; X-Forwarded-For игнорируется. Для прямого backend распределённые IP обходят этот лимит. | `server/http.mjs:33`; `EXPOSURE A04` | Trusted proxy chain с запретом прямого обхода ingress, лимиты по session/account/IP/дорогим операциям, bounded concurrent RPC. Не доверять произвольному X-Forwarded-For |
| A05 | Medium | Воспроизведено при валидной сессии | Уникальные no-op команды бесконечно пишутся в SQLite; terminal matches, worlds и sessions не имеют полной retention policy. Одна активная партия может постепенно заполнить том, замедлить синхронный event loop и heartbeat. | `service.mjs:35,43,46,108`; `store.mjs:25`; `http.mjs:50`; два `EXPOSURE A05` | Quotas/rate limits на команды, размер/срок журнала, bounded history и pagination, удаление просроченных sessions, disk watermark + graceful admission stop; финансовый outbox не удалять до доказанной final-сверки |
| A06 | Medium | Воспроизведено на synthetic RPC | Любая окончательная ошибка отправки, включая истёкший block hash, превращается в вечный PendingChain. Outbox безопасно не переподписывает, но автоматического выхода/диагностики причины нет; повторные чтения способны задержать общий serial worker. | `server/durable.mjs:14-16`, `server/chain.mjs, execute/executeSerial`; `EXPOSURE A06` | Разделить unknown/final failure/expired; доказать non-inclusion и сверить semantic state до ручного resubmit; сохранить старый hash. Никогда не делать слепую новую финансовую транзакцию |
| A07 | Medium | Воспроизведено; нужен restart/outage | После restart `recovering` ждёт обоих игроков, игнорируя обычные 120 секунд disconnect. Отсутствующий проигрывающий игрок может не вернуться и получить refund после 30 минут вместо поражения. Ordinary клиент сам не может вызвать restart этим тестом. | `service.mjs:6,51,52,108`; `EXPOSURE A07` | Утвердить правила server outage отдельно от player disconnect; сохранять доказательства присутствия и начало recovery, bounded recovery deadline, одинаковое уведомление обеим сторонам; тест one/both reconnect и partition |
| A08 | High | Условный риск; наличие соответствующих Mainnet ключей не проверено | Если escrow account сохраняет FullAccess, владелец ключа может заменить WASM в обход `can_upgrade`, затем вывести FT. Admin через разрешённые методы не может произвольно менять beneficiary, но может отменять честные матчи и ставить 100% fee для будущих матчей. | `admin.rs:15,54,65`; NEAR deployment governance требует отдельной проверки | Зафиксировать все access keys на релизном block height, убрать/защитить bypass governance через multisig/timelock, cap/delay fee, разделить admin/deployer/runtime. Emergency authority не должна означать unrestricted treasury access |
| A09 | High | Подтверждено для публичной базы; release evidence gap | Публикуется WASM без исходников/lock/toolchain/CI, поэтому независимый reviewer не воспроизводит бинарник. Startup pin сравнивает два бинарника, а не source→build. | `git ls-tree` базы; `server/chain.mjs:21-22`; import verification | Опубликовать complete build inputs, commit→reproducible WASM→SHA256/base58 chain code hash, независимый rebuild; явно разделить mock/Sandbox и production артефакты |
| A10 | Low | Наблюдение, exploit не показан | Нет Content-Security-Policy для кошельковой страницы. При отдельном XSS/supply-chain событии это ослабляет защиту. HttpOnly/SameSite/Origin/CSRF уже есть. | `server/http.mjs:12`, public bundle build | CSP по фактическим wallet origins/scripts, без wildcard unsafe-правил; browser QA всех поддерживаемых кошельков |

## Депозиты, callbacks, гонки и двойные выплаты

В сохранённых исходниках есть правильные защитные решения:

- FT caller закреплён в `cfg.token`; чужой predecessor, неучастник, дубликат депозита, просроченная revision, stake/fee mismatch и неправильная сумма возвращают весь `amount`. Accepted/locked начисляются атомарно, без promise в `ft_on_transfer` (`deposits.rs:7`). Это требует честного проверенного FT: mock token с символом USDC не является Circle USDC.
- Settlement переводит `locked→owed`, освобождает active slots и сохраняет payout `InFlight` **до** cross-contract transfer. Receiver и amount фиксированы. Повтор результата не проходит InProgress guard. Повтор claim для InFlight/Paid ничего не отправляет (`settlement.rs:18,77,131`).
- `on_payout` private, проверяет predecessor=current, число promise results, payout index и attempt. Повтор/stale callback не повторяет начисление. Failed transfer возвращает Ready, successful переводит owed→paid. Нельзя пометить неизвестный InFlight как Ready только по таймеру.
- Два одновременных joins резервируют место до первого await. Create резервирует account/capacity до await. Commands проверяют membership, ID и последовательность; snapshot+command пишутся в одной SQLite transaction. Outbox сериализует signer nonce, сохраняет подписанные bytes до broadcast, при неоднозначности повторяет тот же hash.
- SQLite lease ограничивает два процесса на одном DATA_DIR. Это не distributed consensus и не разрешение горизонтально запускать backend с разными БД или одним signer в независимых экземплярах.

Выполненные JS guards подтверждают только backend и fake-chain интеграцию. Денежные invariants и receipts требуют запуска Rust/Sandbox на релизном исходнике и WASM: `accepted = locked + owed + paid`, отдельно сумма InFlight, баланс FT escrow ≥ locked+owed с учётом receipts, double-claim/reentrant callback/stale attempt, transfer-success+callback-failure, fee-failure after winner-success, cancel/result/deposit/start во всех допустимых порядках. Для InFlight при потерянном callback пока нет доказанной процедуры безопасного восстановления: receipt reconciliation, отсутствие double pay и сохранение обязанности должны быть продемонстрированы до релиза.

## Отключения, остановка и восстановление

Обычный режим базы: один игрок без GET snapshot/команд 120 секунд проигрывает; оба отсутствуют — backend прекращает игру/heartbeat, прямой emergency refund становится доступен по 30-минутному on-chain timeout. Это серверное измерение доступности, а не доказательство добровольного ухода. GET polling можно автоматизировать; сетевой partition может затронуть только одного игрока. Нельзя считать offline поражение доказательством читерства.

При bot/client tamper экономику рассчитывает сервер; бот с валидными командами остаётся возможным. Перед денежной игрой нужны правила bots/multiaccount/collusion и одинаковая видимость соперника. Seed и состояния обеих сторон доступны участнику: не обещать hidden-information защиту.

Для outage нужен независимый от основного сайта путь: опубликованный escrow/token/account, прямые wallet-вызовы cancel unstarted, mutual cancel, emergency refund и beneficiary claim; инструкция с проверкой chain timestamp и Ready/InFlight/Paid. Отказ сайта не должен лишать игрока инструкции. Возврат требует доступной сети, FT, NEAR gas/storage и успешного callback — 30 минут означают eligibility, а не SLA поступления денег.

Incident drill до запуска: остановить admission; отозвать compromised server authority и доступы CI; сверить final matches/accounting/FT balance и все signed outbox hashes; сохранить WAL/БД/receipt evidence; не удалять DATA_DIR и не откатывать snapshot автоматически; возвраты через проверенный контракт; менять signer только через согласованную процедуру; отдельно расследовать callbacks и admin/deployment keys. Backup должен включать согласованные snapshots+outbox, храниться вне сервера и быть восстановлен на изолированной среде с final-сверкой новых после backup обязательств.

## Обязательные исправления и release gates

1. Контракт: закрыть A02, A09; ограничить денежную экспозицию A01/A08 и максимальный срок блокировки; официально утвердить модель доверенного результата и процедуру dispute. Один restricted function-call key не решает проблему нечестного результата.
2. Backend: закрыть A03–A06; утвердить/реализовать recovery policy A07. Без тестов за настоящим proxy лимит 45/s нельзя считать защитой публичного сервиса.
3. Поставить воспроизводимый contract build и провести Rust+Sandbox negative suite на exact release commit/WASM, включая реальные promise/callback gas, refund races и stalled payout. Шесть новых Rust атак здесь только подготовлены.
4. Совместно проверить три PR на одном интеграционном SHA: ABI, roles, pause/revoke, max match age, token ID/decimals, FT registration, gas, finality, идемпотентность deposit/return, привязка wallet/network и запрет обхода Mainnet signing gate. Review отдельного PR не равен review их композиции.
5. Подтвердить governance и access-key inventory, TVL/stake limits, мониторинг/alarms/backup и инцидентные учения. Никаких private keys в CI artifacts/logs. Наличие внешнего пути к signer не подтверждает Mainnet права.
6. Получить юрзаключение для каждой страны/штата допуска, утвердить age/geo/AML/KYC/ToS и реализовать admission enforcement. См. `LEGAL-CHECKLIST.md`.
7. После исправлений — независимый профессиональный аудит контракта и денежных backend paths, устранение замечаний и повторный review. Testnet полный цикл двумя настоящими кошельками с final receipts не заменяет этот gate.

## Тесты и воспроизведение

В `prototypes/logistics-race/pvp/` после `npm ci`:

```powershell
node --test tests/security-audit.test.mjs
node --test tests/*.test.mjs
```

Выполнено на Windows Node.js v26.13.0: 9 новых JS-проверок, полный suite 31/31. Зависимости проверены через npm ls и совпали с package.json; использован локальный node_modules через ignored junction. Production Node 24 этим локальным прогоном не проверен. Все network обращения новых тестов ограничены 127.0.0.1; chain — FakeChain либо synthetic RPC. Экспозиционные тесты намеренно проходят на уязвимой базе; после исправления заменить assertion на безопасный результат и сохранить test ID. Положительный результат exposure-теста не закрывает finding.

На Linux с pinned Rust выполнить отдельно, без ключей/RPC:

```sh
cargo test --manifest-path security/mainnet-readiness/baseline-contract/Cargo.toml -p near-pvp-escrow --locked
cargo +1.99.1 test --manifest-path security/mainnet-readiness/rust-attacks/Cargo.toml
```

Первая команда использует исходные lock/toolchain и 35 архивных unit tests. Вторая — 6 новых audit tests и создаст собственный lockfile; её dependency resolution и компиляция здесь не проверены. Это mocked VM, не Sandbox. Не запускать demo/deploy/fund/preflight с signer ради этих тестов.

## Письменное заключение

Базовая версия технически **не готова** к публичному Mainnet с реальными USDC. Защита от простого поддельного клиента, повторов команд и обычного повторного settlement предусмотрена, но существенные границы остаются открыты: доверие одному серверу, невозможность немедленно остановить его денежные полномочия, дешёвое исчерпание capacity и отсутствие публично воспроизводимой поставки контракта. В текущей среде не выполнены денежные Rust/Sandbox атаки, не проверена Mainnet governance и нет правового допуска.

Это заключение относится к указанному SHA. Новые PR, даже исправляющие часть findings, требуют отдельного delta review и проверки композиции. Никакой Mainnet deployment или публичный денежный запуск этим отчётом не одобряется.

Повторный review всех PR #1/#2/#3 завершён для указанных в `PR-REVIEW.md` heads. В последнем проверенном CI #1 прошли 38 unit + 9 Sandbox + 3 client. При этом rebuild старой v1 **не совпал** с историческим WASM (`equal:false`); причина ещё не установлена. Это усиливает A09 для старого бинарника. Mainnet-интеграция по-прежнему запрещает платежи, общая композиция конфликтует, NO-GO сохраняется. Подробные hash и границы evidence находятся в повторном отчёте.
