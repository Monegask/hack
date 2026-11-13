> Historical v1 import. Not current v2 instructions or fresh validation. See [candidate specification](docs/candidate/SPEC.md) and candidate migration/security documents. Do not run historical deployment commands for this candidate.

# Интеграция с игрой

## Начальная настройка

Используйте отдельные escrow, admin, server и token аккаунты. Администратор и сервер различны. `get_config.token` — единственный принимаемый FT; замены токена в работающем контракте нет. Проверяйте аккаунты и сеть из собственной конфигурации приложения, не из непроверенной ссылки приглашения.

До первого Ready зарегистрируйте escrow, игроков и fee_receiver на FT через NEP-145 `storage_deposit`. Сначала запросите `storage_balance_bounds` и `storage_balance_of`, затем внесите недостающий storage deposit. Для Circle Testnet live-проверка дала min `1250000000000000000000` yoctoNEAR; при интеграции всегда запрашивайте актуальное значение. Escrow должен иметь native NEAR на storage и 1 yoctoNEAR на каждый `ft_transfer`. USDC не используется для покрытия NEAR-расходов.

Кошелёк игрока и backend signer подключаются через интерфейс `Wallet` из `examples/client.ts`. Его `signAndSendTransaction` возвращает hash. Клиент ожидает FINAL и проверяет подтверждённый `get_match`; ошибка FT resolver может вернуть ставку при успешном внешнем transaction status, поэтому одного успешного статуса транзакции недостаточно.

## Полный сценарий

См. `examples/full-flow.ts`:

1. Сервер создаёт on-chain лобби одновременно с записью в БД. Сохраните полученный монотонный ID; не подменяйте его пользовательским lobby code.
2. Public join занимает место атомарно в БД; private join требует проверки приглашения. Сервер подтверждает соперника через bind_opponent и дожидается final receipt. Эти правила доступа существуют на backend; все on-chain данные публичны даже у private lobby.
3. Каждое Raise содержит ID, предыдущую revision и новую точную сумму. Сохраняйте согласие обоих аутентифицированных участников. При отказе chain не вызывается. При согласии сервер вызывает update_stake. Не принимайте новые предложения после первого confirmed deposit.
4. Значимое действие второго игрока сообщает record_activity. После любого accepted deposit inactivity отключается автоматически.
5. «Готов» читает final snapshot, сверяет его с условиями, показанными игроку, и подписывает один ft_transfer_call. msg включает match_id/revision/stake/fee_bps. Rejected wallet prompt не отмечает готовность. Если snapshot изменился, вернитесь к согласованию, не обновляйте сумму молча.
6. Первый accepted deposit фиксирует stake/revision. Второй должен иметь те же условия. Backend ждёт ReadyToStart с обоими флагами, затем отсчитывает 3 секунды от ready_at_ns с учётом on-chain времени. Общие 600 секунд не продлеваются.
7. Реальный игровой процесс должен быть готов; сервер вызывает start_match до deadline. Не допускайте игровых действий клиентов до final InProgress. При failed start остановите процесс, проверьте состояние и организуйте разрешённый refund; не считайте игру начатой по локальному таймеру.
8. Сервер отслеживает соединения: grace 120s, возвращение продолжает игру; при одиночном timeout подаёт результат в пользу другого игрока. При двустороннем сбое — согласованная отмена или полный admin refund. AFK с соединением не штрафуется.
9. Отдельный worker heartbeat каждые 30–60s передаёт ВСЕ активные ID порциями <=32. Пустой список поддерживает только глобальный heartbeat, не матчи. Мониторьте крайний успешный receipt каждого матча; отставание RPC нельзя считать подтверждением heartbeat.
10. submit_result вызывается один раз после определения победы. Повторная доставка запроса может законно завершиться ошибкой «уже settled» — считайте это успешной обработкой только после сверки сохранённого winner и финального решения.
11. Контракт автоматически отправляет winner и fee. При Ready уведомите конкретного получателя о регистрации/ошибке FT и предложите claim_payout. InFlight не сбрасывается таймером. Не повторяйте распределение банка.

В примере параметры launchGame/stopGame/play поступают из существующей игры. Код не реализует матчмейкинг, аутентификацию HTTP, физику или определение победителя; эти части вне escrow по ТЗ. Случай 25 USDC требует наличия минимум 25 USDC у каждого игрока.

## Индексатор и восстановление

Храните source receipt ID, log index, block height/hash и finality; повторную доставку событий обрабатывайте идемпотентно. Публичный список строится из БД backend, привязанной к on-chain ID. Восстановление после перезапуска сверяет active matches, deposit flags, результаты и выплаты через final views. Отдельный keeper вызывает cancel_expired_lobby; сам контракт не запускается по расписанию.

Сохраняйте accepted Raise revision и исходный deadline. Старые подписанные транзакции имеют NEAR nonce, а msg дополнительно привязан к никогда не переиспользуемому match ID и revision. Mutual cancel подтверждается двумя отдельными кошельками, с текущим nonce запроса.

## Ключ backend

FunctionCall access key серверного аккаунта:

- receiver_id: только escrow;
- methods: create_lobby, bind_opponent, update_stake, record_activity, start_match, submit_result, heartbeat;
- ограниченный allowance на gas;
- attached deposit 0.

Full Access Key server держите вне игрового процесса. Сервер не должен иметь admin/deployment/player keys. Testnet demo автоматически создаёт такой restricted runtime key, сохраняя full access отдельно. Не переносите файл `server-runtime` в браузер.

## Intents

Интерфейс Intents пополняет личный кошелёк. Дождитесь final USDC balance и регистрации FT, затем выполняйте обычный Ready. Не отправляйте Intents-пополнение непосредственно escrow и не используйте контракт как пользовательский баланс.
