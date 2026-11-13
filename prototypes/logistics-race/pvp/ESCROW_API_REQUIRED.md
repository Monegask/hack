# Escrow API mapping · v2 / PR #1

На 13 ноября 2026 прежняя зависимость «API отсутствует» закрыта исходниками [PR #1](https://github.com/Monegask/hack/pull/1), pin `6b6cd1c2f71dead588bbd41e400da9403bc599f8`. Версия wire adapter — `escrow-v2`; `get_config.state_version` обязан быть 2. Источники API.md, contract/src/{lib,models,matches,deposits,settlement,admin}.rs и docs/candidate/{SPEC,MIGRATION,RISKS}.md изучены. Это интеграция audit candidate, не заключение независимого аудита.

| Требование исходного списка | Фактический API и интеграция |
|---|---|
| Identity/config | get_config: immutable token, server/admin, fee_bps, paused, server_frozen, pending_fee, state_version=2. Final get_config и code hash читаются на одной высоте; metadata/FT storage preflight привязаны к этому блоку. Mainnet pin Circle + decimals=6. |
| Match views | get_match включает game_deadline_ns, revision, deposited[2], payout[2], фиксированные получатели и attempts. Строгие u64/u128 strings, состояния и финансовые allocations проверяются адаптером. Неизвестная схема отклоняется. |
| Server lifecycle | create_lobby, bind_opponent, update_stake, record_activity, start_match, submit_result, heartbeat. Ровно эти 7 методов, escrow receiver, deposit=0; без generic function-call API. |
| FT ingress | ft_transfer_call на cfg.token; receiver escrow, exact stake/revision/fee и match_id в msg; 1 yoctoNEAR, 150 Tgas. Свежие balance/storage/gas checks, проверка FT регистрации escrow/обоих игроков/fee receiver. |
| Start/result | ReadyToStart + >=3s, final escrow state; server worker сохраняет engine snapshot до start. Результат отправляется сервером, не из browser won. Ordinary pause разрешает действующие result/heartbeat; freeze блокирует новые server calls. |
| Cancellation/refund | cancel_unstarted_match, request/confirm/reject_mutual_cancel с текущим nonce, forfeit_match, request_emergency_refund. Emergency: stale heartbeat, server_frozen или game_deadline_ns. Player calls 1 yoctoNEAR, 250 Tgas. |
| Async payouts | Ready/InFlight/Paid и attempt проверяются отдельно от Completed/Cancelled. Фиксированный fee receiver может claim index 1 через отдельный direct escrow route без членства в локальной игре. Ready retry не меняет получателя. |
| Fees | floor(2*stake*bps/10000), exact winner remainder; UI показывает effective/scheduled fee. Старый match использует snapshot fee/receiver. 500bps/48h/6h — реализованные политики кандидата для аудита, не новые утверждённые продуктовые требования. |
| Replay/restarts | Durable outbox сохраняет bytes/hash до broadcast; после restart ищется тот же hash, повторяются только исходные bytes. SQLite wallet intents привязаны к deployment/account/request ID, не допускают второй unresolved payment. |
| Receipt reconciliation | Исходный signer/receiver/один FunctionCall/args/deposit; FINAL, final state >= всех receipts, NEP-297 deposit_accepted или подтверждённый FT resolver amount-used=0. Лог result не считается выплатой. |

## Отдельные границы

- Старый Testnet `escrow-v1` не читает v2 schema и сохраняет прежний контракт/WASM/API. Mainnet требует явный `ESCROW_API_VERSION=2`; runtime config не принимает Sandbox-сеть из env.
- Mainnet financial endpoints и загрузка signer остаются выключены без env override. Общие read-only balance/session/config/financial-state/reconciliation endpoints не создают транзакций.
- init, upgrade/migrate, fee/admin/key rotation, native fund и permissionless prune/expiry keeper не выдаются backend runtime key и не имеют generic transaction endpoint. Просроченные лобби закрывает участник либо отдельно одобренный keeper; список из 7 методов не расширен.
- API совместим с нормальным финансовым lifecycle. Потеря callback после успешного перевода, failed FT resolver с необъяснённым остатком и отсутствие оригинального hash не имеют гарантированного автоматического восстановления. Адаптер сохраняет unknown/InFlight. См. CONTRACT_REVIEW-v2.md.
