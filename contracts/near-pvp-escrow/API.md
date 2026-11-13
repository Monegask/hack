# API v0.1

Все вызовы JSON. `match_id`, `nonce`, `attempt`, `revision`, временные метки — decimal strings u64. Денежные суммы — decimal strings u128 минимальных единиц USDC (6 знаков). `fee_bps` — JSON number 0..10000, `index` — 0 или 1. Методы, не отмеченные как payable, требуют attached deposit 0.

## Инициализация и views

| Метод | Аргументы | Результат |
|---|---|---|
| `new` | `{admin,server,token}` | Инициализация один раз, fee=300; account IDs различны |
| `get_config` | `{}` | admin, pending_admin, server, immutable token, fee_bps, paused, last_heartbeat_ns, state_version |
| `get_match` | `{match_id}` | Match или null (нет/уже pruned) |
| `get_active_match` | `{account_id}` | ID или null |
| `get_accounting` | `{}` | accepted, locked, owed, paid, in_flight, live_matches, stored_matches |
| `get_claimable_balance` | `{account_id,match_id}` | `{ready,in_flight}` для этого получателя в этом матче |
| `can_upgrade` | `{}` | paused и нет живых матчей, ставок, обязательств, переводов |

Match возвращает: id, creator, opponent, stake, revision, fee_bps, fee_receiver, created_at_ns, deadline_ns, joined_at_ns, activity_confirmed, deposited[2], ready_at_ns, last_heartbeat_ns, state, winner, cancel_requester, cancel_nonce и payouts[2]. Payout: receiver, amount, state (Ready/InFlight/Paid), attempt. До расчёта payouts содержат нулевые Paid-записи; это не начисления.

## Сервер (predecessor = config.server)

| Метод | Аргументы | Проверки / действие |
|---|---|---|
| `create_lobby` | `{creator,stake}` | Not paused; creator свободен; stake >=1000000 и <=u128::MAX/2; достаточно NEAR storage; возвращает новый ID |
| `bind_opponent` | `{match_id,opponent}` | LobbyOpen, до дедлайна, иной свободный игрок; запускает inactivity 90s |
| `update_stake` | `{match_id,stake}` | AwaitingDeposits, до expiry, депозитов нет, только увеличение; revision++ |
| `record_activity` | `{match_id}` | До expiry, AwaitingDeposits; сервер подтверждает значимое действие присоединившегося игрока |
| `start_match` | `{match_id}` | Not paused, ReadyToStart, >=ready+3s, <created+600s, свежий общий heartbeat |
| `submit_result` | `{match_id,winner}` | InProgress, свежий heartbeat матча, winner участник; фиксирует выплаты и автоматически отправляет их |
| `heartbeat` | `{match_ids:["0",...]}` | <=32 ID; глобальное время обновляется; неистёкшие InProgress матчи обновляются, остальные пропускаются |

Сервер не подписывает платежи игроков. Серверный FunctionCall key ограничивается этим списком методов и единственным receiver escrow. Attached deposit для этих вызовов не нужен.

## Депозит NEP-141

Вызывается на конфигурированном FT:

```json
{
  "receiver_id": "escrow.testnet",
  "amount": "25000000",
  "msg": "{\"match_id\":\"0\",\"revision\":\"1\",\"stake\":\"25000000\",\"fee_bps\":300}"
}
```

Метод `ft_transfer_call`, attached deposit **1 yoctoNEAR**, gas 150 Tgas. Предварительно зарегистрировать escrow и получателей у FT. Клиент проверяет участников, ожидаемую revision/stake/fee по final get_match. Первый успешный депозит окончательно фиксирует текущую revision и stake.

`ft_on_transfer({sender_id,amount,msg})` вызывается только FT. Контракт возвращает `"0"` при полном приёме либо всю amount при отклонении. Проверяет predecessor, msg<=512 bytes, JSON schema, sender, ID, revision, сумму, fee, состояние, дедлайн, паузу, отсутствие повтора. Проверяется sender_id FT, а не signer транзакции. Неподдерживаемый токен не меняет состояние.

## Участники и выплаты

Все следующие методы payable, attached deposit **ровно 1 yoctoNEAR**. Рекомендуемый gas 250 Tgas.

| Метод | Аргументы | Кто / результат |
|---|---|---|
| `cancel_unstarted_match` | `{match_id}` | Любой участник до InProgress; полные refunds |
| `request_mutual_cancel` | `{match_id}` | Участник свежего InProgress; возвращает новый nonce |
| `confirm_mutual_cancel` | `{match_id,nonce}` | Только соперник requester, текущий nonce; полные refunds |
| `reject_mutual_cancel` | `{match_id,nonce}` | Соперник requester; очищает запрос, старый nonce нельзя использовать для нового запроса |
| `forfeit_match` | `{match_id}` | Участник свежего InProgress; победитель — другой участник, комиссия применяется |
| `request_emergency_refund` | `{match_id}` | Участник InProgress при heartbeat>=1800s; полные refunds без admin |
| `claim_payout` | `{match_id,index}` | Только фиксированный receiver этого payout; Ready -> InFlight, возвращает bool |

`claim_payout` не повторяет InFlight/Paid, возвращает false. Может вернуть false и оставить Ready при недостатке gas/операционного NEAR. Проверьте state после финальных receipts. При FT failure зарегистрируйте получателя/устраните причину и повторите claim. Для winner settlement index 0 — winner, 1 — fee; для refund index 0 — creator, 1 — opponent.

## Permissionless

- `cancel_expired_lobby({match_id})`: 0 deposit, любой аккаунт; только prestart и истекшие 600s либо неотключённые 90s; назначает refunds исходным владельцам.
- `prune_match({match_id})`: 0 deposit; только Completed/Cancelled и все payouts Paid.
- `fund({})`: payable, любой размер native NEAR на storage/операционные расходы, без USDC-кредита.

## Администрирование

Все вызовы от admin, 0 attached deposit; except accept_admin — от предложенного нового admin.

| Метод | Аргументы | Действие |
|---|---|---|
| `pause` / `unpause` | `{}` | Новые лобби/депозиты/старты блокируются; refunds, results, claims и heartbeat продолжают работать |
| `set_fee` | `{fee_bps}` | Только новые лобби; допустимы 0 и 10000 |
| `cancel_match_admin` | `{match_id}` | Только prestart/InProgress, полный возврат; не меняет result/payout |
| `propose_admin` | `{admin}` | Предлагает замену, pending_admin можно перезаписать |
| `accept_admin` | `{}` | Двухэтапное принятие; старые fee receivers остаются прежними |
| `set_server` | `{server}` | Только can_upgrade=true; новый server не совпадает с иными ролями |
| `upgrade` | `{code:base64Wasm}` | Только can_upgrade=true; batch DeployContract + private migrate, gas 250 Tgas |

`migrate({})` и `on_payout({match_id,index,attempt})` — private, только self. Callback требует ровно один promise result и текущий InFlight attempt; старые/повторные callbacks ничего не начисляют. Успешный ответ FT любого размера означает успех; ограниченное чтение результата не превращает длинный успешный ответ в ошибку.

## События

Формат NEP-297: `EVENT_JSON:{standard:"near_pvp_escrow",version:"1.0.0",event,data:[...]}`. События: lobby_created (полный snapshot), opponent_bound, stake_updated, activity_confirmed, deposit_accepted, match_started, heartbeat, result_recorded, match_cancelled, payout_dispatched, payout_deferred, payout_resolved, match_pruned, paused, unpaused, fee_changed, admin_proposed, admin_changed, server_changed, upgrade_requested.

Индексировать только final successful receipts; dedup по receipt ID + log index. Наличие лога result не доказывает перевод: проверяйте payout_resolved.success и состояние. Ошибки lifecycle/auth отклоняют receipt целиком. Депозитные ошибки возвращают всю amount через FT resolver.
