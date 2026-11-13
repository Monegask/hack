> Historical v1 import. Not current v2 instructions or fresh validation. See [candidate specification](candidate/SPEC.md) and candidate migration/security documents. Do not run historical deployment commands for this candidate.

# Проектирование до реализации

Статус: принятые технические решения для первой Testnet-версии. Дата: 2026-11-05.

## Проверка SDK и USDC

Проверены официальные источники:
- near-sdk 5.30.0: https://docs.rs/near-sdk/5.30.0/near_sdk/
- NEP-141: https://github.com/near/NEPs/blob/master/neps/nep-0141.md
- NEP-145: https://github.com/near/NEPs/blob/master/neps/nep-0145.md
- Circle: https://developers.circle.com/stablecoins/usdc-contract-addresses

Circle публикует указанный в ТЗ mainnet ID и testnet ID
`3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af`.
Перед деплоем нужны live RPC-проверки metadata, decimals=6, storage registration и реальный Testnet smoke test. Совместимый локальный mock FT применяется только в тестах; выплаты escrow используют настоящие cross-contract ft_transfer.

SDK фиксируется точной версией, Rust/toolchain и Cargo.lock фиксируются после проверки сборки. В исходной среде Rust/Node отсутствуют; инструменты устанавливаются отдельно в /private/tmp, без изменения системного PATH.

## Неопределённости ТЗ и решения

1. Комиссию на момент создания, неизменный 600-секундный дедлайн и запрет параллельного участия нельзя независимо проверять, если до первого депозита существует только изменяемая запись backend. Выбрана минимальная on-chain регистрация лобби при его создании. Она не содержит публичного списка, чата, приглашений или Raise-предложений. Цена: одна серверная транзакция создания и привязки соперника. NEAR storage спонсирует контракт, backend-ключ может оставаться FunctionCall.
2. Игрок не подписывает произвольные серверные условия вслепую: ft_transfer_call.msg содержит ID, revision, stake и fee_bps. Первый депозит атомарно фиксирует revision; второй подтверждает те же условия. Сервер может менять stake/revision только пока нет депозитов; комиссия никогда не меняется. Клиент проверяет участников через get_match перед подписью.
3. Предложения/отказы Raise остаются на backend. Только принятое увеличение передаётся в update_stake. Начало подтверждения кошельком и другие значимые действия сообщает сервер через record_activity; без доверия к серверу эти off-chain действия не наблюдаемы. Депозит любого участника отключает 90-секундный таймер независимо от сервера.
4. Нет автоматических фоновых таймеров в NEAR: контракт проверяет время на каждом действии; игрок или keeper вызывает отмену истёкшего лобби. Keeper не назначает получателей.
5. Глобального heartbeat недостаточно: у каждого InProgress матча свой last_heartbeat. heartbeat принимает ограниченный список ID. После 1800 секунд heartbeat матча нельзя воскресить, результат/forfeit уже не принимаются, доступен только возврат. Heartbeat подтверждает серверное заявление, а не действительное выполнение игровой логики; злонамеренный сервер остаётся доверенной стороной.
6. Completed означает подтверждение всех ненулевых переводов. SettlementPending фиксирует необратимый результат и обязательства до отправки; Cancelled фиксирует необратимую отмену, но возвраты могут ещё ожидать повторного claim. Новое участие разрешается после фиксации терминального финансового решения.
7. При нулевом призе или комиссии перевод не создаётся. Округление комиссии вниз, остаток победителю. Умножение делится на quotient/remainder без переполнения. Ограничение stake <= u128::MAX/2 — предел представления банка, а не бизнес-лимит.
8. Администратор не получает метод назначения победителя. Смена server разрешена только после урегулирования всех матчей/обязательств. Смена admin двухэтапная, получатель комиссии фиксируется в лобби. FT ID неизменен.
9. Автовыплаты независимы. При недостатке gas/операционного NEAR обязательство сохраняется как Ready. Повторный claim авторизован только получателем. InFlight никогда не переводится обратно в Ready по времени: неизвестный исход требует разбора, иначе возможна двойная выплата.
10. Очистка завершённых записей permissionless после всех переводов. Монотонный u64 ID никогда не переиспользуется; active index освобождается при финансовом решении. Статистика накопленных депозитов/выплат проверяется checked arithmetic; достижение предела счётчика останавливает новые депозиты.

## Минимальный API

Сервер: create_lobby(creator, stake), bind_opponent(match_id, opponent), update_stake(match_id, stake), record_activity(match_id), start_match(match_id), submit_result(match_id, winner), heartbeat(match_ids).

Игрок: ft_on_transfer через единственный разрешённый FT; cancel_unstarted_match, request/confirm/reject_mutual_cancel, forfeit_match, request_emergency_refund; claim_payout(match_id, index).

Администратор: pause/unpause, set_fee, propose_admin/accept_admin, set_server (drained), cancel_match_admin, upgrade (paused+drained). Любой: cancel_expired_lobby, prune_match, fund.

Views: get_match, get_config, get_accounting, get_active_match, get_claimable_balance(account_id, match_id), can_upgrade. Callback on_payout — private.

## Состояния и деньги

LobbyOpen -> AwaitingDeposits -> ReadyToStart -> InProgress -> SettlementPending -> Completed.
Любое незавершённое лобби/активный матч может законно перейти в Cancelled; после финансового решения повторный расчёт запрещён. Negotiating хранится на backend; AwaitingDeposits включает переговоры до первой оплаты.

accepted = locked + owed + paid. owed включает Ready и InFlight. Ошибка FT не уменьшает owed; успех callback уменьшает owed и увеличивает paid ровно один раз. Каждая операция переводит только зафиксированную сумму зафиксированному получателю. payout attempt nonce связывает callback с конкретной попыткой.

## Краткий threat model

Недоверенные игроки/кошельки: неверный токен/сумма/revision/ID, повторные депозиты, перекрёстные матчи, поддельный callback, повторный result/claim, отмена в гонке со стартом. Защита: predecessor, participant index, строгие состояния, время receipt, неизменные условия, nonce и атомарный state-before-promise.

Ошибки инфраструктуры: незарегистрированный получатель, FT failure, газ/NEAR, потеря backend, зависший матч. Защита: независимые claims, сохранение обязательств, preflight registration, запас NEAR, необратимый timeout каждого матча.

Доверенные стороны: сервер определяет победу и сообщает off-chain активность; token определяет FT ledger и может иметь blacklist/pause/upgrade; admin может делать полные возвраты; full access/deployment key может заменить весь код. Политика drained upgrade не защищает от внешнего DeployContract обладателя full access. Нужны отдельное управление ключами и аудит до реальных ставок.
