# Фактическая проверка

Дата отчёта: 2026-11-05 15:58 MSK.

## Локальная проверка

`bash scripts/check.sh` завершён с exit code 0. Финальный контракт: **35 unit tests, 3 NEAR Sandbox integration tests, 3 TypeScript client tests — все passed**. Rustfmt, Clippy с `-D warnings`, WASM release build и `tsc --noEmit` — passed. После добавления resume-demo Testnet CLI повторно прошёл форматирование, сборку и Clippy всех targets, затем выполнил живой demo.

Инструменты: Rust 1.99.1; near-sdk/near-contract-standards 5.30.0; near-workspaces 0.24.0; Sandbox 2.14.0; Node 24.22.2; TypeScript 7.0.2. Зависимости зафиксированы lock-файлами. Лог локального прогона: [local-checks.log](local-checks.log).

WASM escrow SHA-256: `8d581487374ce5f59935deb3710c952cfdda07ef9f9c9a8cd366716fb8f74d77`. Сборка и копия в artifacts совпадают. Sandbox и Testnet используют этот собранный WASM.

## Публичная NEAR Testnet

Контракт: [dev-20261105124711-29870979355191.testnet](https://testnet.nearblocks.io/address/dev-20261105124711-29870979355191.testnet).

Тестовый FT: [dev-20261105124714-71962479239708.testnet](https://testnet.nearblocks.io/address/dev-20261105124714-71962479239708.testnet). Это собственный совместимый NEP-141 токен с 6 знаками; он **не является Circle USDC**.

Полный цикл успешно выполнен с ограниченным server FunctionCall key (receiver escrow, семь методов, allowance 5 test NEAR). Начальная ставка 10 -> accepted Raise 25, revision 1. Два депозита по 25; countdown; авторизованный start; result в пользу Alice; независимые реальные FT transfers и private callbacks.

- Матч 0: `Completed`.
- Alice: 48.5 тестовых USDC.
- Admin fee: 1.5 тестовых USDC.
- Bob: 0; escrow FT balance: 0.
- Оба payout: `Paid`, attempt 1.

Независимый final RPC preflight подтвердил регистрацию и те же балансы на высоте 276343999, block time `2026-11-05T12:56:09.505809985Z`. Отчёты: [testnet-demo.json](testnet-demo.json), [demo-ft-preflight.json](demo-ft-preflight.json). Дополнительная final RPC-проверка [testnet-state.json](testnet-state.json) подтвердила: accepted=paid=50000000, locked=owed=in_flight=live_matches=0; on-chain code hash совпадает с собранным WASM; server имеет один ограниченный ключ на семь методов escrow.

Готовая публичная конфигурация: [testnet-config.json](../../examples/testnet-config.json).

| Операция | Транзакция |
|---|---|
| create_lobby | [3ZPAYJH6JQ1bbkqcr7NjMz4h5A56ZhpmmrS7jntwgXCa](https://testnet.nearblocks.io/txns/3ZPAYJH6JQ1bbkqcr7NjMz4h5A56ZhpmmrS7jntwgXCa) |
| bind_opponent | [BuqTAa2pEzijwGXtNQpWRdBPyGYcrXa8p2yHhQ8tRvuo](https://testnet.nearblocks.io/txns/BuqTAa2pEzijwGXtNQpWRdBPyGYcrXa8p2yHhQ8tRvuo) |
| update_stake | [LzzsD1AYbv8SEbH6yHxRTeHGfFf2S722dF9ZhWZHrnC](https://testnet.nearblocks.io/txns/LzzsD1AYbv8SEbH6yHxRTeHGfFf2S722dF9ZhWZHrnC) |
| ft_transfer_call | [KMHxtiYsfaG9a6djL9SMfP7kgzfKPgPEwWZS3k49j6b](https://testnet.nearblocks.io/txns/KMHxtiYsfaG9a6djL9SMfP7kgzfKPgPEwWZS3k49j6b) |
| ft_transfer_call | [7xuRk8JxZGwutLC9PFzBfUxAXM1GVRTXZRnxqthSpSfi](https://testnet.nearblocks.io/txns/7xuRk8JxZGwutLC9PFzBfUxAXM1GVRTXZRnxqthSpSfi) |
| heartbeat | [961SaJ4yL1Rm5NanGQ65n4PJC3jV3LvKvyJmDhdCqEEu](https://testnet.nearblocks.io/txns/961SaJ4yL1Rm5NanGQ65n4PJC3jV3LvKvyJmDhdCqEEu) |
| start_match | [EcVzqXCwqPTp5kvJNCnMTJgzWemUDL7KhoVPP2pyjTji](https://testnet.nearblocks.io/txns/EcVzqXCwqPTp5kvJNCnMTJgzWemUDL7KhoVPP2pyjTji) |
| submit_result | [2qQQHWLMmeLQZGHuwJpYJf1nejMcqeumbQZStSMtqFii](https://testnet.nearblocks.io/txns/2qQQHWLMmeLQZGHuwJpYJf1nejMcqeumbQZStSMtqFii) |

Первый запуск setup выявил слишком малый allowance 1 test NEAR для reservation максимального gas. Вызов был отклонён до исполнения; старый runtime key отозван, новый ограниченный ключ с allowance 5 установлен, финансовый цикл выполнен успешно. Это изменение конфигурации CLI, не финансового контракта.

## Circle USDC и пределы проверки

Официальный Circle Testnet token ID сверён с документацией Circle и live RPC: metadata ft-1.0.0, decimals=6, storage min 1250000000000000000000 yoctoNEAR. См. [circle-testnet-preflight.json](circle-testnet-preflight.json) и [список Circle](https://developers.circle.com/stablecoins/usdc-contract-addresses).

Фактические FT transfers в публичной сети выполнены с проектным тестовым FT. Переводы именно Circle USDC не выполнялись: для них нужны тестовые монеты Circle и отдельный smoke test. Юридическая допустимость ставок и независимый аудит кода не проверялись; готовность к Mainnet не заявляется.

## Управление demo и ключи

Постоянный защищённый каталог **вне репозитория и архива**: `/Users/pavel/.near-escrow/testnet-demo-20261105` (каталоги 0700, файлы 0600). Ключи admin, escrow deployment, server full access, Alice, Bob и FT owner сохранены отдельно. `server-runtime/` содержит только ограниченный backend signer; Full Access Key server остаётся в родительском каталоге и не должен попадать в процесс игры. `demo-accounts.json` сопоставляет роли и аккаунты. В /private/tmp остаётся исходная копия; постоянная копия защищает от очистки tmp.

Для дальнейших тестовых ставок admin-владелец demo FT может вызвать `mint({account_id,amount})` на токене. Для переноса проекта используйте архив; credentials переносите отдельно защищённым способом. Не добавляйте их в Git. Развёрнутый demo остаётся unpaused; финансовых обязательств после матча 0 нет. Описание полной ключевой политики и ограничений Full Access находится в [SECURITY.md](../../SECURITY.md).
