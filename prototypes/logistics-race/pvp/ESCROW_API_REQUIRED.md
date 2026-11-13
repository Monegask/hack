# Новый escrow API — несогласованная зависимость

Состояние на 13 ноября 2026: согласованный API не предоставлен. Это список данных для согласования, **не спецификация существующего нового контракта**. Старый Testnet адаптер остаётся единственным поддерживаемым write API. Mainnet запрещает match views и mutations, чтобы не подменять новый ABI старым.

Для каждого метода нужны точное имя, JSON args/result, версия схемы, decimal-string/u64/u128 правила, attached yoctoNEAR/gas, access role, idempotency key и переходы состояний.

- Identity/config: chain, escrow ID, token ID, token decimals, exact code hash, pause flags, config revision, fee bps/rounding/base, fee receiver, server/admin/upgrade roles, immutable vs changeable terms.
- Match views: идентификатор, игроки, stake, принятые фактические депозиты, revision/acceptance, deadline, state, server heartbeat, cancellation nonce, winner/result, выплаты/возвраты с amount/receiver/state/attempt.
- Lifecycle writes: create/bind/update/accept/start/activity/heartbeat/result, повтор одной операции и конфликт разных payload.
- FT ingress: точная схема msg, допустимый sender_id/predecessor/token, депозит после expiry, двойной депозит, unbound opponent, ft_resolve_transfer и частичный/полный возврат.
- Cancellation: до старта, взаимное согласие, отказ/истечение nonce, emergency expiry, forfeit, simultaneous finish/disconnect.
- Payouts: приз, комиссия и refund obligations; Ready/InFlight/Paid либо их реальные аналоги; callback failure, retries, fixed receiver, storage registration; запрет повторной выплаты при неизвестном результате.
- Reconciliation: события/version, tx/receipt/block linkage и finality; безопасное восстановление после timeout/restart, изменения конфигурации/ролей/upgrade; доказательство отсутствия обязательства перед новым платежом.

После согласования добавить отдельный versioned adapter и contract fixtures. Не включать его одним env flag. Независимый аудит, проверка прав денежных соревнований и явное разрешение rollout остаются обязательными условиями отдельного решения.
