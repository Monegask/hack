# Обязательные исправления и evidence до запуска

13 ноября 2026. Ниже требования review, а не уже выполненные функции. Ответственные роли предложены. Итоговый статус: **NO-GO**.

| Приоритет | Ответственный | Что требуется | Доказательство закрытия |
|---|---|---|---|
| P0 | Backend / security | A01: решение по доверенному результату, предел средств под риском, независимый replay/result evidence, dispute/incident policy | Письменная модель угроз, утверждённые лимиты, атака compromised signer, независимый review |
| P0 | Contract / ops | A02: emergency server revocation при живых матчах | Freeze до/после result/heartbeat, немедленный participant refund на exact release WASM. Дизайн добавлен в PR #1; обычный pause недостаточен |
| P0 | Backend | A03: cleanup истёкших лобби и Sybil admission | Expired/no-deposit hosts не блокируют новый честный match; keeper не отменяет оплаченный live game; malicious wallets не исчерпывают capacity |
| P0 | Release / contract | A09: complete exact source→WASM provenance | Locked build, immutable source SHA, production/mock разделение, независимый rebuild, deployed hash и role inventory после отдельно разрешённого deployment |
| P0 | Integration | R06: свести PR #1/#2/#3 и согласовать v2 ABI | Разрешённые semantic conflicts, новые builds, полная shared-SHA suite, browser journeys и negative tests. Старый Testnet WASM не обновлять вслепую |
| P0 | Integration | R07: freeze/absolute deadline в backend, UI и прямой exit-инструкции | Refund по frozen/deadline при свежем heartbeat, admission stop, прекращение heartbeat и result для frozen/stale game |
| P0 | Ops / governance | A08: полномочия account keys/deployer/admin | Public-key inventory на final block, multisig/timelock/immutable deployment decision, отдельные admin/runtime credentials, freeze drill |
| P0 | Counsel / product | Country/state legal matrix, age, AML/KYC применимость, ToS и enforcement | Подписанное юридическое заключение для каждой страны допуска; никакого вывода «skill game разрешена везде» |
| P0 | Independent auditor | Денежные paths и остаточный callback-liveness риск | Профессиональный аудит и retest; accounting/receipt reconciliation при success-transfer+failed-callback, понятный способ сохранить/восстановить обязательство без double pay |
| P1 | Backend / ingress | A04 + R01: лимиты proxy/account/session и RPC amplification | Проверки за настоящим trusted proxy, direct-origin bypass закрыт, bounded discovery index/cache, settlement heartbeat не голодает |
| P1 | Backend | A05: bounded commands/history/sessions + disk pressure | Quotas/retention, expiry cleanup, admission halt при watermark, финансовый outbox не удаляется преждевременно |
| P1 | Backend | A06: classify expired/unknown/final failed tx | Безопасная reconciliation и доказанная non-inclusion до resubmit; старые hashes сохранены |
| P1 | Frontend / chain | R05: successful rejected/refunded deposit journal | Реальные resolver receipts + final match/FT evidence; journal может быть корректно завершён, ошибочный auto-repeat отсутствует |
| P1 | Product / backend | A07: outage/restart/disconnect rules | 120s grace и restart recovery явно разделены; one/both reconnect, partition, malicious absence после рестарта |
| P2 | Frontend | A10: CSP и wallet compatibility | CSP без широких wildcard; browser QA фактического selector/подписей |

P0 и P1 — обязательные до публичного real-money запуска. P2 — обязательное решение security owner: внедрение либо документированное принятие остаточного риска. Один passing unit test или AI «approve» не закрывает строку без указанного evidence.

R02/R03/R04 раннего PR #1 (format mutation, generic artifact path, устаревшие документы) исправлены по чтению последующего source; финальный CI/provenance и release documentation всё равно требуют проверки. Подробности и версии в `PR-REVIEW.md`.

Не снимать Mainnet payment/signing gate как «последний env flag» до выполнения этих условий. Данный review не уполномочивает deployment, реальные переводы или изменение production.
