# Промежуточный integrated review — 13 ноября 2026

Кандидат: `4149986661d03efb1a3bf350f8d574b53752d9e9`, `release/mainnet-v1`. Статус: **NO-GO для real-money Mainnet**; это не финальный review ожидаемого v2 adapter.

Порядок интеграции, зафиксированный Git: PR #1 `6b6cd1c`, PR #2 `079c2cb`, PR #3 `fa7a91e`, PR #4 `0a9db39`, затем release hardening. Использована собственная detached копия `tmp/release-4149986`; чужой release checkout не менялся. Незакоммиченные исправления автора release не приписываются этому SHA.

## Проверки

- Самостоятельно выполнен полный backend suite: **51/51**, Node.js v26.13.0, Windows, fixture chain/loopback. Это подтверждение прогона, не аудит реальных receipts/ключей.
- Добавлен и выполнен `pr-tests/release-4149986.test.mjs`: **8/8**. Два GUARD подтверждают улучшения; шесть EXPOSURE намеренно воспроизводят остаточные проблемы. Passing exposure не закрывает finding.
- Прочитаны semantic changes PR #4: engine route cache, сохранение fixed-step backlog, prepareWorld/recovery, grouped commands/savepoints/commit rollback, checkpoint batching, ETag/gzip/metadata, per-session budgets, match-read coalescing, block-time cache и lease fencing перед send_tx. Проверены integrated Mainnet guards и matched HTTP/client changes.
- Реальные транзакции/пользовательские кошельки, production и секреты не затрагивались. Cargo/новые Rust audit tests здесь не запускались; результаты upstream CI не выдаются за собственный Rust прогон.

## Результаты по severity

| ID | Severity | Результат на 4149986 | Обязательное действие |
|---|---|---|---|
| A03, unpaid | High в базе; частично исправлен | Истёкшие cached-unpaid записи не занимают global local cap, но исходный участник остаётся active до on-chain cancel. Новый честный account допускается — GUARD прошёл | Не считать это полным cleanup/on-chain admission |
| A03, funded | High | Два истёкших AwaitingDeposits лобби с одним депозитом при maxActive=2 сохраняют все слоты; новый честный игрок получает full | Keeper/операционная процедура permissionless cancel_expired_lobby с отдельным ограниченным credential; Sybil/admission controls. Семь runtime методов не являются препятствием для отдельно спроектированного keeper |
| A03, stale snapshot | Medium, exposure accounting | cached deposited=false после истечения позволяет освободить local cap, хотя fixture chain уже приняла депозит. Деньги не списываются/не теряются этим решением, и host остаётся reserved | Локальный cap не считать TVL/financial-liability cap. Для утверждения об отсутствии средств нужны свежие final evidence; обязательства учитывать независимо |
| R01, error retry | Medium | Один failing read удаляет весь discovery cache. 8 лобби × 5 последовательных limit=1 запросов дают 40 RPC calls, хотя семь лобби исправны | Negative cache/backoff/partial results и независимый бюджет upstream RPC |
| R01, generations | Medium | Four workers ограничивают одну cache generation. После завершения первых четырёх reads, пока следующие четыре pending, успешный новый create меняет key; новая generation начинает четыре уже прочитанных ID. Получено **8 одновременных уникальных RPC**, включая настоящий Chain.match in-flight dedup | Общий discovery gate/ожидание pending generation и общий bound, а не только локальный Promise.all(4) |
| A04 | Medium | Две валидные sessions одного wallet получают по 45 requests/second, суммарно 90. Общий proxy bucket для вошедших игроков устранён, account quota пока отсутствует | Общий account budget; отдельные IP/admission/global limits и защита от многих аккаунтов. Account limit сам по себе не Sybil resistance |
| A05 | Medium, частично исправлен | Terminal worlds cache освобождается, wire cache ограничен 800; command queue ограничена. Durable commands/history/sessions и долгоживущие match records всё ещё без полной quota/retention policy | Disk watermark, quota, archival/retention без удаления unresolved outbox |
| P4-01 / A07 | Medium | При recovery elapsed time до первого pump попадает в общий fixed-step backlog. После подключения обоих игроков он проигрывается как игровое время; воспроизведён рост time >29s без продвижения тестовых часов между 60 pumps | Отделить catch-up работающих игр от frozen/recovering игр; до восстановления не начислять им время. Не обнулять общий backlog ценой потери времени других активных матчей |

Новый P4-01 воспроизводит длительный warmup/startup или stall до первого advance восстановленного сервиса: взять сохранённый playing match, создать GameService (recovering=true), продвинуть wall clock на 30s, touch обоих участников, затем вызвать advance. Старое ограничение dt=.5s также не давало идеального freeze, но PR #4 превращает этот промежуток в сохранённые 30s backlog и полностью его проигрывает. Это не доказательство, что обычный игрок способен удалённо вызвать restart/stall; предпосылка — recovery/startup interruption. В обычном непрерывном pump backlog catch-up проверен штатным тестом и полезен.

## Semantic merges и положительные guards

- HTTP public lobby routes входят в Mainnet requirePayments gate; service и signer не включены для Mainnet. Не найден обход денежного gate через новые catalogue/Join routes. Это не проверка будущего адаптера.
- Join выполняет fresh chain read и повторную проверку места после await; reservation сохраняется до bind. TTL каталога не используется вместо fresh Join проверки.
- Commands HTTP возвращают success после outer SQLite COMMIT. Audit injection outer commit failure для **двух разных матчей** откатывает оба состояния, revision, sequences, seen и durable IDs; оба запроса отклонены. Положительного acknowledgement до failed commit не получено.
- Route cache ключует endpoint/direction/diagonal и полный roads set, копирует возвращаемый маршрут и имеет bound 128 на engine. В данном static review не обнаружена передача изменяемого cached route клиенту. Determinism evidence пользователя относится к одному seed/tape, повторённому 50 раз; это полезная regression, не покрытие всех seeds/команд/аварий.
- Broadcast вызывает assertLease непосредственно перед send_tx. Не найден новый путь обхода membership/CSRF через metadata/304; штатный HTTP suite проверяет auth и reconnect touch для conditional polls.

Benchmark evidence не доказывает финансовую пропускную способность: load harness использует FakeChain, а не реальный signer/nonce/RPC/receipts. Windows Node 26 не подтверждает Linux Node 24/VPS. Отчёт 300s load, доступный в изменяемом release checkout, не входит в Git tree 4149986; его нельзя автоматически приписывать этому SHA без проверки source hashes и фиксации artifact. Повторять тот же дорогой load ради security review здесь не требовалось.

## Воспроизведение

Из audit worktree:

```powershell
$env:AUDIT_PVP_ROOT = (Resolve-Path 'tmp/release-4149986/prototypes/logistics-race/pvp').Path
node --test security/mainnet-readiness/pr-tests/release-4149986.test.mjs
```

Только mock data и loopback. Synthetic Chain.view не делает HTTP/RPC и не загружает signer. Нельзя менять assertion exposure на «pass» без безопасного результата/реальной причины закрытия.

## Вывод и следующий срез

Часть исходных проблем устранена или смягчена, semantic merge сохраняет основные денежные запреты. A03/R01/A04 нельзя закрывать целиком по существующим happy-path tests. A01 trusted winner, A06 outbox recovery, A07 outage policy, A08 governance, callback liveness, legal/professional audit gates сохраняются; R05/R07 ожидают готового адаптера и отдельного review. Публичный Mainnet с реальными USDC по этому SHA не одобряется.

Автор release сообщил об исправлениях negative cache/global discovery gate и account budget после этого SHA. Это пока сообщение о WIP, не проверенный результат данного среза. Потребуются новый immutable SHA, повторные negative tests и versioned v2 adapter; прежний exposure suite нужно интерпретировать как атаки на 4149986, а не как требование сохранить уязвимое поведение.
