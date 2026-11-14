# Targeted retest — 13 ноября 2026

Immutable candidate: `564c0b436fd47b19899baf0a728497d0620d1aa0`. Собственная detached копия `tmp/release-564c0b4`; release checkout не менялся. Это повторная проверка конкретных исправлений после 4149986, **не финальный допуск v2 adapter**. Статус публичного real-money Mainnet: **NO-GO сохраняется**.

## Выполнено reviewer

- Полный backend suite кандидата: **64/64** на Windows Node v26.13.0.
- Новые положительные retests `pr-tests/release-mitigations.test.mjs`: **4/4**.
- Выбранные прежние сценарии из `release-4149986.test.mjs`: **4/4** — два GUARD и два EXPOSURE A03. Старые RPC/recovery EXPOSURE assertions специально не запускались как критерий успеха исправленного кода; generation-тест старой атаки ожидал событие, которое исправление запрещает.
- Прочитаны diff service/HTTP, новый adapter/recovery и существующие tests. Это local mock/loopback проверки; публичного RPC, секретов, deployment и реальных транзакций не было. Rust/Sandbox на этом SHA reviewer не выполнял.

## Решение по findings

| Finding / сценарий | Статус на этом SHA | Evidence |
|---|---|---|
| R01: immediate error eviction | **Исправлено, воспроизведение закрыто** | Пять последовательных limit=1 запросов при одном failing match дают 8 reads, не 40; после истечения TTL происходит новый refresh, failed entry не делает данные вечными |
| R01: simultaneous cache generations | **Исправлено, воспроизведение закрыто** | После pending IDs5–8 реальный create нового лобби не запускает второй discovery fan-out. Использован настоящий Chain.match dedup. Первый snapshot исключает новый ID, следующий refresh включает его; чтение создания отдельно от discovery допустимо |
| A04: несколько сессий одного wallet | **Исправлено, воспроизведение закрыто** | 45 запросов, распределённых между двумя сессиями, допускаются; 46-й отклоняется 429. Другой wallet за тем же адресом продолжает работать |
| P4-01: recovery backlog | **Исправлено, воспроизведение закрыто** | Два реально созданных матча восстанавливаются в разное время. Ранее восстановленный получает >29s backlog; позднее восстановленный получает 0s из этого периода, затем продвигается только после нового clock delta |
| A03: expired unpaid capacity | **Прежняя частичная mitigation сохранена** | Новый честный account допускается; старый host остаётся reserved до on-chain cleanup |
| A03: expired one-sided funded capacity | **Открыт, подтверждено повторно** | Два лобби с одним депозитом при maxActive=2 после expiry занимают оба слота и блокируют честного нового игрока |
| A03: stale unpaid snapshot как financial-cap evidence | **Открыт, подтверждено повторно** | Cached unpaid запись может освобождать local cap после final deposit, которого worker ещё не видел. Само это решение не переводит и не теряет деньги; local cap не является TVL/liability cap |
| PR4: cross-match group rollback | **Положительный guard сохранён** | Failed outer commit откатывает два матча и durable command IDs; положительного ACK не получено |

Закрытие конкретных R01 attacks не доказывает полную защиту от DoS. Discovery всё ещё требует admission/upstream budgets, защита нескольких разных accounts остаётся отдельной задачей. Invalidated candidate set может требовать новых reads; concurrent refresh bound и TTL не являются общим экономическим или сетевым лимитом. A04 account budget не доказывает Sybil resistance, корректность production ingress или защиту до аутентификации.

P4-01 закрыт отдельно от A07: утверждение правил player disconnect/server outage, стратегическое отсутствие после restart и порядок возвратов всё ещё требуют решения. Per-match resumeAt сохраняет backlog соседнего матча и не обнуляет его ради восстановления другого.

## Граница v2 review

Новый source включает v2 adapter, receipt-linked payment intents и reconcile-before-heartbeat/control. Mainnet payment/signing gate сохранён. Успешные штатные tests подтверждают исполнение локальных fixtures, но не закрывают автоматически R05/R07 и всей денежной интеграции. Ожидаются финальная policy fee/receiver, exact integrated SHA, полный receipt/Sandbox evidence и проверка failure paths.

Перед финальным verdict отдельно проверить, что bounded reconcile workers ограничивают не только concurrency, но и задержку heartbeat при длинной очереди expired/history/unresolved записей; A03/A05 cleanup и retention остаются важными для v2. Это открытое acceptance condition, не результат нового measured load в этом retest.

Остальные gates остаются: trusted result authority A01, A06 unknown/expired outbox recovery, A08 governance/access keys, A09 историческая binary provenance, callback liveness, юрзаключение и независимый профессиональный аудит. Частичный зелёный retest не означает разрешение включить Mainnet или снять программные ограничения.

## Повторение

Из audit worktree:

```powershell
$env:AUDIT_PVP_ROOT = (Resolve-Path 'tmp/release-564c0b4/prototypes/logistics-race/pvp').Path
node --test security/mainnet-readiness/pr-tests/release-mitigations.test.mjs
node --test --test-name-pattern='^(GUARD A03|EXPOSURE A03|GUARD PR4)' security/mainnet-readiness/pr-tests/release-4149986.test.mjs
```

Полный suite запускался из `tmp/release-564c0b4/prototypes/logistics-race/pvp`: `node --test tests/*.test.mjs`. Node modules — ignored junction к уже установленным pinned dependencies, signer не загружается. Новые tests только добавлены в audit branch; продуктовый код здесь не менялся.
