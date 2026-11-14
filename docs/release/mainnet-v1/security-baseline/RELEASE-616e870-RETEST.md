# Повторный security review — 14 ноября 2026

**Supply Line, `616e870aafaeacfa47ac6150c72d5e01e1ea9723`: NO-GO для публичного Mainnet с реальными USDC.** Конкретные R08 и K1 исправлены по независимым локальным воспроизведениям. Это AI-review, не независимый профессиональный аудит и не юридическое заключение.

Проверена отдельная detached копия в audit worktree. Реальные транзакции не отправлялись; подписи в тестах создавались только одноразовыми вымышленными ключами для intercepted mock RPC. Секреты, production и пользовательские сохранения не затрагивались. Предыдущие отчёты, включая [80d09e0](RELEASE-80d09e0-FINAL.md), сохраняют историю findings.

## Самостоятельные проверки

На Windows/Node26.13.0 прошли **79/79 backend tests, 5/5 новых audit tests и 12/12 прежних положительных проверок**. Код новых проверок: [r08-queue-path-retest.test.mjs](pr-tests/r08-queue-path-retest.test.mjs).

| Severity исходного замечания | Замечание | Результат на616e870 |
|---|---|---|
| High | R08: старые лобби задерживают heartbeat живого матча до принудительного refund | Конкретный сценарий закрыт: 360 старых лобби, 90 циклов с20s медленными чтениями, клиенты постоянно подключены; heartbeat gap≤60s, игра остаётся playing, история продвигается |
| High | R08: справедливость ограниченной очереди | 65 живых матчей с медленным первым чтением: все получают проверку за три прохода, каждый batch≤32; забытый хвост не воспроизведён |
| High, защитная проверка повторного исполнения | Очередь heartbeat обходит ранее подписанные операции | Не воспроизведено: сохранённые nonce7/8, вставленные в обратном порядке, сверяются раньше новых9/10/11; единственный dispatcher, priority применяется к неподписанным запросам |
| High, защитная проверка повторного исполнения | Unknown predecessor позволяет подписать новые операции | Не воспроизведено: unknown nonce7 блокирует новые подписи heartbeat и ordinary; повторяются те же bytes, signed outbox сохраняется |
| Непроранжированный K1 hardening | Внутренний каталог `..signer-*` ошибочно считается внешним | Закрыт: внутренний путь отклонён до чтения JSON, внешний пустой fixture доходит до ошибки формата credentials |

Для K1 это узкая проверка separator-aware containment, не доказательство безопасности произвольных symlinks/junctions или всего secret management. Пять новых проверок не дают гарантий при произвольном RPC latency, полном лимите200 игр или компрометации хоста.

Прежний `EXPOSURE R08` намеренно ожидает старую уязвимость и на новой версии падает (3 history reads вместо4). Его исключили из positive suite через `--test-skip-pattern='EXPOSURE R08'`; падение исторического теста не выдано за новый продуктовый дефект. Положительный retest выше проверяет сохранность игры, а не только изменение числа чтений.

Воспроизведение в audit worktree, после установки pinned dependencies кандидата:

```powershell
$env:AUDIT_PVP_ROOT = (Resolve-Path 'tmp/release-616e870/prototypes/logistics-race/pvp').Path
node --test security/mainnet-readiness/pr-tests/r08-queue-path-retest.test.mjs
node --test --test-skip-pattern='EXPOSURE R08' security/mainnet-readiness/pr-tests/v2-policy-recovery.test.mjs security/mainnet-readiness/pr-tests/release-mitigations.test.mjs
```

## CI, Sandbox и нагрузка

Проверены successful [backend→Rust Sandbox43577158948](https://github.com/Monegask/hack/actions/runs/43577158948), [contract43577158957](https://github.com/Monegask/hack/actions/runs/43577158957) и [release43577158967](https://github.com/Monegask/hack/actions/runs/43577158967). CI фактически checkout merge `0ca5092485e34399f9b15aed70338409791237ac`; его полное Git tree совпадает с616e870, diff пуст. Это producer CI evidence; reviewer Rust локально не запускал. Selected logs: [evidence](release-616e870-evidence.json).

Backend Sandbox повторяет полную engine партию seed42/91commands/940.3simsec→winnerSide1→Rust выплату9.7/fee0.3, SQLite restart, registration/replay/failed fee/claim/refunds/freeze/disconnect. Final mock-token accounting accepted=paid55000000; locked=owed=in_flight=live_matches=0, escrowFT0. Это не Circle USDC и не Mainnet. ContractCI:38 unit,9 Sandbox, production build comparison, format/lints/client checks successful. Production candidate SHA256 `a6ebecd0b7f78dad11167b63cffd2fe9c646f307f73ac95dbc62c683ca0d9e91`; исторический v1 mismatch остаётся, независимая provenance аттестация не выполнена.

Изучен переданный интегратором `load-50-v2-priority.json`: Windows,50 игр/100 клиентов/300s,145974 requests, ошибок0, APIp95≈32.81ms, commandp95≈42.40ms,100 reconnects,149 v2SyncCycles, v2BranchExercised=true. Хеши всех10 server source files и load fixture совпали с собственной immutable копией616e870. Engine artifact hash отдельно не пересобирался. Явный v2 adapter/control действительно включён, прежний blind spot legacy load исправлен. Но FakeChain.execute обходит реальный Chain dispatcher/signing/RPC: это service/HTTP/SQLite benchmark с искусственной задержкой, не замер Mainnet throughput и не Linux VPS capacity certification. Полный300s benchmark reviewer заново не запускал.

## Обязательные условия до запуска

| Severity | Открытый блокер / обязательная работа |
|---|---|
| Critical | Новый подтверждённый Critical этим retest не установлен; это не гарантия отсутствия |
| High | A01: доверенный сервер выбирает победителя; согласовать модель доверия, защиту от компрометации/сговора, независимую валидацию или dispute, лимиты stake/TVL |
| High | A03: funded expired лобби и stale финансовые snapshots; нужны cleanup/keeper, admission/квоты, Sybil/ingress защита и безопасный учёт обязательств |
| High | A08: FullAccess/governance/custody могут обойти контрактные роли; проверить фактические Mainnet права, хранение и ротацию ключей |
| High | A09: provenance исторического v1 WASM не закрыта; новый release требует exact source→build→published/on-chain hash проверки и независимой проверки |
| Medium | A05: bounded retention/диск/история команд; A06: операторское восстановление unknown signed tx/orphan intent и callback InFlight без слепого reset/re-sign |
| Medium | A07: утвердить правила disconnect, простоя, emergency exits и проверить злоупотребления/восстановление на целевой инфраструктуре |
| Low | A10: CSP/wallet hardening и оставшиеся меры из baseline |

Также обязательны профессиональный независимый аудит exact release, воспроизводимая проверка native Circle USDC интеграции, operational runbooks/restore drills и юридический допуск по фактической географии. [Checklist для юриста](LEGAL-CHECKLIST.md) не определяет разрешённые страны: юрист должен заполнить country/state classification, age, AML/KYC/sanctions при применимости и Terms of Use. Технический retest не заменяет эти решения.

**Mainnet signing/payments hard-off должны сохраняться.** Закрытие R08 и K1 не меняет общий NO-GO и не разрешает deployment. Изменения после616e870 требуют отдельного review.
