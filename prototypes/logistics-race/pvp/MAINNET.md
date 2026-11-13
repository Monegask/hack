# Подготовка Circle USDC / NEAR Mainnet · 13 ноября 2026

Эта ветка — подготовка интеграции, **не готовый Mainnet PvP**. Новый escrow API отсутствует (пользователь подтвердил, что не знает о существующем согласованном API). Mainnet запускается только как проверяемый read-only клиент баланса/аутентификации после заполнения реальных deployment-параметров. Финансовые маршруты, FT-регистрация, игровые матчи и server signer в Mainnet заблокированы кодом. Переменной окружения для снятия блокировки нет. Production не развёртывался, средства не переводились, секреты не читались.

## Что изменено

- Testnet остаётся сетью по умолчанию со старым escrow API и mock FT. `.env.example` сохранён; `.env.testnet.example` — явный профиль.
- `.env.mainnet.example` требует явных RPC/origin, escrow/server/token, ожидаемого code hash и абсолютного отдельного DATA_DIR. REQUIRED — обязательные незаполненные значения, а не реальные аккаунты. Не подставлять старый Testnet escrow или WASM.
- Единственный Mainnet token ID: `17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1`. Это нативный USDC из [реестра Circle](https://developers.circle.com/stablecoins/usdc-contract-addresses); USDC.e и любые другие токены отклоняются независимо от symbol.
- Preflight Mainnet проверяет RPC chain_id, ID токена, decimals=6, symbol=USDC, code hash escrow и его FT-регистрацию. Не вызывает неизвестные методы нового escrow и не выдаёт code-hash pin за независимый аудит. Права/роли нового escrow пока не подтверждаются.
- Wallet connector и NEP-413 используют выбранную сервером сеть; сообщение привязано к сети, escrow, origin и одноразовому nonce. Проверяются подпись и FullAccess ключ на выбранном RPC. Browser не выбирает сеть параметром URL. При смене deployment ответы отвергаются до перезагрузки.
- SQLite привязана к network/escrow/token. Mainnet отвергает чужую либо заполненную старую БД без scope. Старые Testnet-сессии остаются допустимыми только в Testnet. Сохранения игры не удаляются.
- Баланс: final FT balance, NEP-145 registration/bounds, NEAR amount минус storage_usage × storage_amount_per_byte. Это консервативная оценка liquid NEAR: staking collateral не засчитывается. Резерв 0.01 NEAR — политика допуска, **не обещанная цена gas**. Изменение цены газа и одновременные траты могут всё равно привести к отказу транзакции.
- Testnet self-registration: только текущий authenticated account, registration_only=true, точный storage minimum, проверка NEAR для storage + gas. Уже зарегистрированный аккаунт не получает второй запрос. Escrow и fee receiver оператор должен зарегистрировать отдельно; backend не спонсирует чужие аккаунты.
- Перед Testnet-депозитом заново проверяются точные terms/revision/opponent, FT registration/balance и NEAR. Перед прочими wallet-вызовами проверяется gas. Старый API escrow и restricted signer сохранены.
- Суммы отображаются целочисленно, включая micro-USDC; принятые депозиты, общий принятый объём, комиссия/банк/приз и отдельные payout/refund состояния читаются из escrow. Mainnet не показывает вымышленный fee rate или match data.

## Повторные платежи и неизвестный результат

Web Locks исключает одновременную подпись в нескольких вкладках одного origin. Перед вызовом кошелька localStorage получает журнал с deployment/account/match/action; перезагрузка, sign-out и другая вкладка его не стирают. После ответа кошелька сохраняется hash, если он возвращён. Кнопки заблокированы до конкретного подтверждения: принятый депозит, регистрация, переход соответствующего payout в InFlight/Paid или нужное состояние escrow. Успех wallet API сам по себе не подтверждает выплату. Серверный outbox по-прежнему повторно передаёт те же подписанные байты, а не создаёт новый платёж.

При известном hash `/api/payment-status` проверяет выбранную сеть, signer, hash и FINAL. Только окончательная top-level Failure позволяет автоматически снять блокировку неуспешной транзакции; успешный tx без принятого депозита не трактуется как депозит. RPC timeout, unknown tx, receipt failure и возврат из FT resolver требуют дальнейшей проверки. Если кошелёк закрылся/отказал без hash, журнал остаётся заблокированным: приложение не может доказать отсутствие broadcast. Проверить историю кошелька, receipts и final escrow с оператором; не удалять журнал/данные, чтобы просто повторить оплату. Полный пользовательский workflow безопасного разбора случая без hash остаётся открытым. Web Locks не координирует разные устройства; защита от двойного приёма должна обеспечиваться escrow.

## Локальные команды

Node.js 24+, из этой папки:

```powershell
npm ci
npm test
npm run test:finance-ui
node ../build-offline.cjs
node ../game-3d/build.mjs
node ../bot/build-race.cjs
npm run build
```

Для `game-3d/build.mjs` нужны зависимости `../threejs-trial` (`npm ci` там). Первая команда build-offline выполняет требуемую пересборку автономного HTML; игровые правила не изменены. Не использовать user data для тестов. Browser QA создаёт изолированные контексты Edge и тестовый HTTP сервер, не обращается к RPC/кошелькам.

Для read-only Mainnet preflight после появления настоящего escrow и проверенных параметров:

```powershell
node --env-file=.env.mainnet server/preflight.mjs
```

Не запускать до заполнения шаблона. Mainnet SERVER_KEY_FILE должен быть unset; сервер не загрузит signer. Значения существующего Testnet signer не копировать в Mainnet. Примеры env не содержат ключей. Любой запуск/deployment за пределами локальной QA потребует отдельной задачи; этот PR ничего не публикует в runtime.

## Что ещё требуется до Mainnet

1. Согласованный versioned escrow API: views, схемы/единицы, ft_transfer_call msg, методы всех lifecycle/refund/claim операций, события, таймауты, роли и ровно допустимые методы runtime key. См. `ESCROW_API_REQUIRED.md`.
2. Новый adapter с schema validation, настоящие адреса/roles/token pin, проверка fee receiver и всех получателей на FT storage, независимый аудит exact WASM и upgrade/admin permissions.
3. Проверка разрешений для денежных соревнований; отдельное решение о rollout и снятии программной блокировки через review.
4. Тест нового API с failure callbacks, refund resolver, payout retries, финальностью и перезапусками; затем отдельно авторизованный end-to-end цикл с двумя кошельками. Нынешние fixtures не являются on-chain выплатами.
5. Завершить recovery без hash/при успешном FT tx с полным возвратом; доказать безопасность повторов на контракте. Проверить реальные Meteor/HOT/другие кошельки на Mainnet и mobile redirects. Сейчас проверены сетевые параметры и NEP-413 в изолированных тестах.

Источники: [Circle USDC](https://developers.circle.com/stablecoins/usdc-contract-addresses), [NEAR wallet login](https://docs.near.org/web3-apps/tutorials/wallet-login), [NEP-413](https://github.com/near/NEPs/blob/master/neps/nep-0413.md), [NEP-141/145/148](https://docs.near.org/primitives/ft/standard).
