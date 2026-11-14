# Техническое заключение — 14 ноября 2026

Supply Line, immutable SHA **`80d09e086debe3d8dd3bc752a3acb4664d49fe15`**, release/mainnet-v1. **NO-GO для публичного Mainnet с реальными USDC.**

Это самостоятельный от implementation-потоков AI-review точной версии, **не независимый профессиональный аудит** и не юридическое заключение. Изменения после этого SHA не получают автоматического approval.

## Область и собственные проверки

Проверены integrated v2 adapter/HTTP/client, policy300bps/fee receiver, receipt reconciliation, intents/replay, durable broadcast, emergency controls, scheduler и source provenance. Использована собственная detached копия audit worktree/tmp/release-80d09e0. Release checkout, production, секреты и пользовательские сохранения не менялись; реальные транзакции reviewer не подписывал/не отправлял.

На exact80d09e0 самостоятельно прошли **72/72 backend tests и13/13 audit checks**. В13 checks входит **EXPOSURE R08**, который подтверждает открытую проблему, а не её исправление. Windows/Node26.13.0; audit использует actual local HTTP/client function/adapter/reconciler, in-memory SQLite и synthetic receipts. Cargo/Rust reviewer локально не запускал.

История сохранена: [baseline](REPORT.md), [PR review](PR-REVIEW.md), [4149986](RELEASE-4149986-REVIEW.md), [564c0b4](RELEASE-564c0b4-RETEST.md), [подробный1bf3fd7](RELEASE-1bf3fd7-REVIEW.md). Предыдущие failed/partial результаты не переписывались.

Contract source inputs совпадают с6b6cd1c2f71dead588bbd41e400da9403bc599f8 по Git diff. Главный server delta1bf→80d — корректная metadata: `signerChecked:false`, отдельный `runtimeKeyChecked` для проверки public access-key permission. Клиент проверяет выбранный wallet account до создания payment intent. Mainnet signer loading и financial writes остаются hard-off.

## Исправления, подтверждённые review

| Область | Статус и предел вывода |
|---|---|
| Policy300/receiver | Проверяется перед новым create/signing и deposit request. Это backend admission policy; Rust generic cap500/admin powers не превращаются в неизменяемые3% |
| R05 resolver refund | Successful rejected/duplicate FT resolver refund завершает persistent intent/client journal. Failed resolver, unknown hash и final head позади receipts не разрешают повтор |
| R07 freeze/deadline | Adapter/HTTP допускают emergency refund при свежем heartbeat по frozen/absolute deadline. Freeze full-refund подтверждён actual Rust CI. Смена admission policy не блокирует возврат прежнего обязательства |
| Intent replay | Original request восстанавливается после изменения chain state; другой match/action/terms отклоняется. Resolved replay не отдаёт новую transaction template |
| Durable fresh broadcast | Signed bytes сохраняются до первого send_tx; lookup ещё не отправленного hash пропущен. Existing signed operation сохраняет hash/bytes без re-sign; lease fencing остаётся |
| R01/A04/P4-01 | Negative TTL, shared pending generation, общий account budget и per-match recovery clock прошли положительные retests. Это не закрывает broader Sybil/ingress/outage policies |
| R06 композиция | Исходный merge/adapter evidence gap преодолён общим SHA и successful backend→Rust Sandbox. Это не закрывает остальные launch gates |

## Actual Rust Sandbox и CI

Проверен [run43576008510](https://github.com/Monegask/hack/actions/runs/43576008510), job132390294089: **success на80d09e0**. Проверены логи actual backend/HTTP + Rust WASM в локальном NEAR Sandbox, с собственным mock FT. Это не Mainnet/Circle USDC и не собственный локальный запуск reviewer.

Логи подтверждают restricted runtime key с отказом FT/native transfer/upgrade; потерю ответа после реального Sandbox broadcast и SQLite restart с тем же hash; self FT registration/replay; два депозита/countdown; полную authoritative engine игру **seed42,91 commands,940.3 simulated seconds**, computed winnerSide1→Rust payout9.7/fee0.3; duplicate resolver refund; failed fee→Ready/restart/claim без повторного winner payout; one-sided refund, private callback forgery и mutual-cancel stale nonce. Дополнительно — playing SQLite restart с exact state hash, оба reconnect, затем one-sided disconnect по grace→Rust payout; freeze→полные refunds.

State SHA256 полной партии: `56171d893e7ed6758a6e6dea743b15f44d994f6ff443b3e904bf47a153b80759`. Final accounting: **accepted=paid=55000000; locked=owed=in_flight=live_matches=0; escrowFT=0** — всё в mock-токене. Selected logs сохранены в `release-80d09e0-ci-evidence.json`.

[Linux release run43576008514](https://github.com/Monegask/hack/actions/runs/43576008514) также success. Отдельный contract run43576008527 при последнем чтении ещё выполнялся; прежний38+9+3 success не приписывается ему автоматически. Его последующий статус можно уточнить append-записью. В1bf backend/Rust CI был failed: harness начинал следующий match до reconcile direct cancellation; текущий successful CI устраняет этот прежний evidence gap.

## Обязательные открытые findings

| Severity | ID | Риск и необходимое действие |
|---|---|---|
| Critical | — | Подтверждённого обычному игроку arbitrary withdrawal/double-payout пути не заявлено. Это не доказательство отсутствия |
| **High** | **R08** | V2 sync ждёт всей history/expired очереди до heartbeat. **Воспроизведено на80d**:360 старых лобби,90 групп по4 bounded20s reads; оба игрока continuously connected, live heartbeat не отправлен, игра переходит в refund. Нужны deadline/priority live-control+heartbeat, bounded background queue/keeper и retest с сохранением freeze/deadline safety |
| High | A03 | One-sided funded expired лобби исчерпывают cap; cleanup/admission/Sybil controls не завершены. Cached unpaid snapshot не является TVL/liability proof |
| High | A01 | Один доверенный сервер может выбрать проигравшего участника победителем. Требуются принятая модель доверия/dispute и предел средств под риском; restricted key не проверяет честность результата |
| High, условный | A08 | Escrow FullAccess, если сохранён, обходит upgrade gate. Actual Mainnet key inventory/governance/admin custody не проверены; admin влияет на отмены/будущие настройки |
| High, provenance gap | A09 | Historical v1 source/WASM rebuild mismatch не разрешён. Это не доказательство подмены, но source-only review не подтверждает exact historical deployed bytes |
| Medium | A05 | Durable commands/history/sessions/intents/outbox требуют quota/retention/disk-pressure policy без удаления обязательств/unknown tx |
| Medium | A06 | Unknown/expired signed ops и intents без hash остаются blocked; нужна безопасная проверенная reconciliation. Слепой reset/re-sign запрещён |
| Medium | A07 | Требуются утверждённые server outage/restart/player disconnect правила и независимый exit runbook. Один grace/restart test не решает policy abuse целиком |
| Low | A10 | CSP/кошельковая совместимость и browser hardening требуют решения security owner |

R08 подробно описан в [1bf report](RELEASE-1bf3fd7-REVIEW.md), последний тест `v2-policy-recovery.test.mjs`. Он использует virtual clock и bounded slow mock reads, не заявляет контроль attacker над public RPC или кражу средств; подтверждён availability/fairness/forced-refund риск. Service.sync этой ветки в80d не менялся. Простое перемещение heartbeat перед всеми checks не является достаточным исправлением: fresh freeze/deadline safety сохранить.

**Нагрузочный blind spot:** load/server.mjs создаёт FakeChain без adapter и cfg.adapterVersion. V2 reconcile-before-heartbeat/control не исполняется; fingerprint adapter файла не означает исполнения его ветвей. Поэтому green50×300s legacy-style load не опровергает R08 и не доказывает v2 финансовый RPC/signer throughput. Exact1bf60s hashes сверены отдельно; после изменения chain.mjs его нельзя автоматически назвать exact80d load.

## Письменный verdict

Выпуск с реальными USDC **технически не готов**. Adapter/recovery и полный actual Rust Sandbox существенно усиливают evidence, но не устраняют High R08, funded lobby DoS, централизованный результат и непроверенные privileged-key/operational assumptions.

До запуска обязательны: исправление/retest R08 и A03/A05; safe recovery/incident/backup процедуры; решение по A01 и governance A08; exact release source→WASM/proper production artifact; независимый профессиональный аудит/retest; юридический допуск каждой страны/штата и age/AML/KYC/ToS enforcement. [Checklist counsel](LEGAL-CHECKLIST.md) сохранён; допустимые юрисдикции этим review не определялись.

Не снимать Mainnet signing/payment gates. Это заключение не разрешает deployment или реальные переводы. Любое устранение замечаний после80d требует нового SHA и отдельного retest.
