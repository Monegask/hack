> Historical v1 import. Not current v2 instructions or fresh validation. See [candidate specification](docs/candidate/SPEC.md) and candidate migration/security documents. Do not run historical deployment commands for this candidate.

# Testnet и обновления

## Подготовка

1. Установите Rust/rustup, build tools, Python 3, Node.js 24+. Выполните `bash scripts/check.sh`. Этот шаг обязателен перед деплоем.
2. Создайте отдельные Testnet аккаунты escrow, admin и server. Для хранения кода и storage escrow потребуется несколько тестовых NEAR; держите запас на рост состояния, 0.01 NEAR операционного резерва и gas на аккаунтах вызывающих.
3. Выберите тестовый FT с 6 знаками. Официальный Circle Testnet ID: `3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af`. Mainnet ID из ТЗ подтверждён Circle, но эти скрипты работают только с фиксированным Testnet endpoint.
4. Проверьте токен и аккаунты:

```bash
python3 scripts/preflight.py --accounts escrow.testnet alice.testnet bob.testnet admin.testnet
```

Указанные имена заменяются вашими. preflight только читает сеть. Метаданные не доказывают происхождение токена: сверяйте полный ID с [официальным списком Circle](https://developers.circle.com/stablecoins/usdc-contract-addresses).

## Деплой на свои аккаунты

Файл ключа — стандартный NEAR JSON с account_id/public_key/private_key, хранится за пределами репозитория. Не передавайте ключ текстом в shell, чат или коммиты.

```bash
bash scripts/deploy-testnet.sh \
  /absolute/protected/escrow.testnet.json \
  admin.testnet server.testnet \
  3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af
```

CLI проверяет, что аккаунт не содержит кода, проверяет FT metadata/decimals, атомарно отправляет deploy+new, затем регистрирует escrow в FT на актуальный storage min. Если registration не прошла, контракт уже может быть инициализирован: повторять первичный deployment нельзя; выполните storage_deposit отдельно. Скрипт не перезаписывает существующий контракт через Full Access Key.

Получателей регистрирует их кошелёк или спонсор. Пополните игроков тестовым USDC и выполните сценарий из INTEGRATION.md. Проверьте фактические FT balances после settlement и callbacks, а не только статус вызова submit_result.

## Автономный тестовый demo

```bash
cargo run --manifest-path tests/sandbox/Cargo.toml --locked --bin testnet -- \
  demo /absolute/protected/near-escrow-demo
```

Использует публичный Testnet helper для создания отдельных аккаунтов, если сервис доступен. Создаёт собственный тестовый NEP-141 token с decimals=6, деплоит escrow, регистрирует получателей, выдаёт по 25 тестовых USDC, создаёт лобби 10 -> accepted Raise 25, делает оба ft_transfer_call, выдерживает countdown, start, result и проверяет реальные 48.5/1.5 USDC и нулевой остаток escrow.

Это проверка совместимого тестового токена, **не доказательство выполнения FT-перевода Circle USDC**. Отдельная live-проверка официального токена требует его тестовых монет на аккаунтах. Mock owner может mint/burn; он не пригоден для реальных средств.

Demo также устанавливает ограниченный FunctionCall ключ server с allowance 5 test NEAR; игровая последовательность использует его. Full access server остаётся отдельно для управления ключами. Данные доступа сохраняются немедленно после создания аккаунта: родительский каталог 0700, JSON ключей 0600 на Unix. `server-runtime/` содержит отдельный restricted signer. `report.json` содержит только публичные IDs/tx hashes/результаты.

Если helper недоступен/ограничен, demo прекращается с ошибкой; уже созданные аккаунты и ключи сохраняются. В таком случае используйте свои профинансированные Testnet аккаунты. Не считайте неудачную попытку выполненным deployment. `/private/tmp` может очищаться ОС: для дальнейшей эксплуатации перенесите credentials в защищённое постоянное хранилище, не в Git.

## Ключевая политика

- Admin — отдельный аппаратный/защищённый кошелёк; 2-step rotation через propose_admin/accept_admin.
- Server runtime — FunctionCall receiver escrow, только семь серверных методов из API, ограниченный gas allowance. На сервере нет deployment/admin/player keys.
- Server full access и escrow deployment key — offline/operator storage; аудит выдачи/отзыва, резервное копирование, ротация.
- Смена server через контракт разрешена только paused+drained. Перестановка ограниченного runtime key на том же server аккаунте выполняется оператором с server full access и не меняет contract.server.
- Пользовательские кошельки не передают свои ключи backend.

## Обновление

1. Admin pause; остановить создание и подключение лобби в backend.
2. Довести все лобби/матчи до результата или полного refund. Heartbeat не выключать до решения по каждому матчу.
3. Исполнить все Ready payouts, дождаться всех callbacks. Проверить locked=owed=in_flight=live_matches=0 и `can_upgrade=true`. Непогашенный InFlight нельзя списывать таймаутом.
4. Проверить новый WASM hash, аудит изменений, совместимость layout и тесты migration. Текущий `migrate` поддерживает только layout v1 без изменения схемы.
5. Admin вызывает `upgrade({code:base64})` с 250 Tgas. DeployContract и migrate выполняются одним batch receipt; ошибка должна откатить batch. Проверить final code/hash, config и accounting.
6. При необходимости `set_server`, затем unpause и backend resume.

Full Access Key escrow может обойти шаги и ограничения посредством внешнего DeployContract. Для enforceable governance нужен отдельный проверенный механизм управления ключами; один только Rust gate не гарантирует отсутствие административного злоупотребления. Никогда не используйте initial deploy script как путь обновления активного escrow.

Для повторения demo после ошибки на полностью завершённом setup, **до создания первого лобби**:

```bash
cargo run --manifest-path tests/sandbox/Cargo.toml --locked --bin testnet -- \
  resume-demo /absolute/protected/near-escrow-demo
```

Режим читает demo-accounts.json и защищённые credentials, проверяет отсутствие active match и исходные балансы, отзывает предыдущий runtime key и создаёт новый с allowance 5 test NEAR. При уже начавшемся финансовом цикле повторный demo запрещён: исследуйте final state и используйте штатные методы возврата/claim. Allowance должен покрывать reserve gas одной транзакции, а не только фактически сожжённый gas; CLI применяет max_gas=300 Tgas, TypeScript — 250 Tgas для серверных операций. Следите за текущей gas price, остатком allowance и балансом server; размер allowance не является переводом NEAR.
