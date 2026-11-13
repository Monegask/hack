# Проверка подготовки Mainnet · 13 ноября 2026

База: `testnet-pvp-server`, commit `0e13688`. Отдельный worktree `publishing/mainnet-integration`, ветка `feat/mainnet-integration`. Другие checkout и публичный runtime не менялись. Автоматический Vercel deployment этой feature-ветки отключён локальной branch-specific настройкой vercel.json перед первым push. Соседние feature-ветки public-matchmaking и perf/pvp-scalability не объединены; при merge нужны разрешение пересечений http/main/client и сохранение обеих функциональностей.

## Выполнено

- Анализ client/app.mjs, server/config.mjs, chain.mjs, http.mjs подтвердил жёсткую привязку к Testnet, старому escrow/WASM и mock FT.
- Введены network/deployment scope, строгий Mainnet env, native Circle token pin, read-only preflight и сетевой NEP-413.
- Testnet сохраняет прежний escrow API и signer restrictions; добавлены свежие funding/gas checks, безопасный self-registration и защита UI от повторной подписи при неизвестном результате.
- Mainnet не загружает signer, не вызывает неизвестный ABI и не выдаёт fee/match/payout fixtures за живые данные. GameService worker не создаётся для Mainnet.

## Результаты локальных проверок

| Проверка | Результат |
|---|---|
| `node --test pvp/tests/*.test.mjs` | 34/34, включая 12 новых Mainnet/финансовых тестов |
| `node pvp/tests/browser-finance.mjs` | PASS, Edge headless, изолированные профили |
| `node --test tests/*.cjs` | 117/117 игровых регрессий |
| `node build-offline.cjs` | PASS, автономный HTML пересобран |
| `node game-3d/build.mjs`, `node bot/build-race.cjs`, `node pvp/build.mjs` | PASS, PvP bundle пересобран |
| `node --check pvp/public/app.js`, `git diff --check` | PASS |

Браузерная проверка покрывает потерю ответа после broadcast, блокировку нового платежа после reload/во второй вкладке, обрыв API и реконнект, восстановление по принятому депозиту, смену wallet account, смену deployment scope и read-only Mainnet UI без финансовых кнопок. Node-тесты дополнительно проверяют FINAL failure/retry gate, неверный signer/hash, NEP-413 с реальной криптографической подписью ephemeral ключа, переиспользование challenge в другой сети, неправильный FT/metadata/hash/network, недостаток FT/gas/storage, изоляцию БД и сохранность Testnet-сессии.

Финансовые/браузерные QA используют явно изолированные fixtures. Они **не являются** реальными Testnet/Mainnet депозитами или выплатами. Реальные кошельки, ключи, on-chain roles, mainnet code и реальные receipts не проверялись; публичные RPC для финансового цикла не вызывались. Сохранения пользователя не сбрасывались.

## Ограничения и блокеры

Согласованный API нового escrow отсутствует. Его интеграция, проверка ролей/fee receiver, новый финансовый end-to-end, независимый аудит и проверка разрешений денежных соревнований остаются открытыми. Mainnet payments программно заблокированы без env override. Неизвестная wallet-транзакция без hash и успешный FT tx с возвратом остаются заблокированными до отдельной проверки, см. `MAINNET.md`. Не проверялись реальные wallet redirects/mobile и подписание в Mainnet.

Исходная инструкция проекта запрещала Mainnet; новое поручение 13 ноября разрешает подготовку кода, сохраняя запрет на deployment/production deposits до отдельной проверки. Этот PR — кандидат для ревью, а не разрешение на эксплуатацию.
