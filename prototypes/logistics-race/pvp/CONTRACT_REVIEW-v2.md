# Замечания к PR #1 из интеграции backend/frontend

Проверен head `6b6cd1c2f71dead588bbd41e400da9403bc599f8`, Rust state_version=2. Семь серверных методов и deposit msg соответствуют исходникам; отдельного ABI-conflict, требующего изменения этих методов, не найдено. Ниже — конкретные незакрытые зависимости для **полного автоматического financial recovery**, а не заявление о новом найденном exploit.

## C1 · InFlight после неуспешного callback

Источник: contract/src/settlement.rs, dispatch сохраняет InFlight/attempt перед ft_transfer, on_payout переводит в Paid/Ready только при исполненном callback. Если FT уже перевёл средства, но callback не исполнился, claim_payout не повторяет InFlight, и публичного proof-based repair нет. Воспроизведение состояния: успешный FT receipt + failed/missing callback, get_match.payouts[index]=InFlight. Timeout/reset или повторный перевод может заплатить дважды.

Adapter: сохраняет InFlight/unknown, не выдаёт повторный claim и не маркирует Paid по root tx status. Для снятия blocker нужен проверенный proof-based recovery API либо явно одобренная incident/migration процедура; внешний RPC audit сам по себе не меняет обязательство в контракте. Это ограничение уже признано в SPEC/RISKS PR #1.

## C2 · Failed FT resolver с unaccounted token remainder

Источник: contract/src/deposits.rs принимает либо возвращает всю сумму, но issuer может запретить последующий ft_resolve_transfer. Возможна цепочка: FT transfer состоялся -> receiver вернул unused -> resolver Failure. Контракт не принял депозит и не создавал refund obligation, а токены могут остаться в escrow. Общий ft_balance_of не доказывает владельца остатка; API refund для такого intent и authenticated receipt-proof attribution отсутствует.

Adapter: сверяет original transaction/receipts, оставляет unknown, запрещает повтор. Для полной автоматизации нужны независимый дизайн attribution/recovery и review issuer edge cases; generic admin sweep либо подмена unaccounted остатка accepted deposit недопустимы.

## C3 · Потерянный hash и архивные receipts

Это зависимость wallet/RPC, не ошибка Rust. После broadcast кошелёк может не вернуть hash. API v2 не индексирует deposit по уникальному client intent ID. Серверный wallet journal позволяет вручную привязать **точный** исходный hash, но отсутствие tx в одном RPC не доказывает отсутствие broadcast. Нужен принятый incident/archival policy; автоматическое снятие блокировки небезопасно.

## Границы полномочий

FunctionCall key: только escrow receiver, exact семь методов, deposit=0, finite funded allowance; full access, wildcard/extra methods и oversized allowance отклоняются. Sandbox дополнительно проверяет реальные on-chain отказы FT/native transfer и upgrade. Семь методов всё равно дают серверу право назначить участника победителем; stronger result attestation в v2 нет. Keeper/admin/upgrade/fund/claim не добавляются в runtime allowlist.

Параметры fee cap 500bps, timelock 48h, game deadline 6h реализованы кандидатом для аудита и требуют продуктового/security принятия. Mainnet endpoints остаются hard-disabled до независимого аудита и проверки разрешений; разработка adapter не снимает эти условия.
