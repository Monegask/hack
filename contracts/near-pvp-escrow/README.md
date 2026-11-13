# NEAR PvP Escrow

Rust-контракт для двух равных ставок в USDC: NEP-141 депозиты, серверное подтверждение старта/результата, комиссия, отмены, forfeit и самостоятельный аварийный возврат. Игровая логика и NEAR Intents находятся вне escrow.

Реальные FT-переводы выполняются через `ft_transfer`, а результат каждого перевода подтверждается private callback. Неудачная выплата остаётся обязательством перед исходным получателем.

## Быстрый запуск

Нужны Rust/rustup, C/C++ build tools, Python 3 и Node.js 24+. Версии Rust и зависимостей зафиксированы в `rust-toolchain.toml`, `Cargo.lock`, `tests/sandbox/Cargo.lock` и `package-lock.json`. На macOS нужен Apple Silicon; для Sandbox также поддерживается Linux x86_64/aarch64.

```bash
rustup show
npm ci --ignore-scripts
bash scripts/check.sh
```

Полная проверка собирает WASM, запускает unit-тесты, Sandbox с настоящими cross-contract receipts, Clippy, форматирование, TypeScript и клиентские тесты. Первый запуск загружает SDK и Sandbox.

```bash
bash scripts/build.sh
python3 scripts/preflight.py
```

Результат сборки: `artifacts/near_pvp_escrow.wasm`, тестовый `test_usdc.wasm` и SHA-256 manifest. `artifacts/` не хранится в Git. Компиляция `cargo build --target wasm32-unknown-unknown` проверяется выполнением того же WASM в Sandbox; cargo-near для этого проекта не обязателен.

## Документация

- [Проектирование и решения по неоднозначностям](docs/DESIGN.md)
- [Архитектура](ARCHITECTURE.md)
- [API](API.md)
- [Интеграция backend и кошелька](INTEGRATION.md)
- [Модель безопасности](SECURITY.md)
- [Развёртывание и обновление](DEPLOYMENT.md)
- [Тесты и ограничения проверки](TESTING.md)
- [Полный TypeScript-пример](examples/full-flow.ts)

Ставка задаётся строкой минимальных единиц: `"1000000"` = 1 USDC. Начальная комиссия 300 bps (3% банка), таймер лобби 600 секунд, inactivity 90 секунд, countdown 3 секунды, аварийный порог heartbeat каждого матча 1800 секунд.

## Структура

`contract/src` содержит контракт, модели, приём ставок, жизненный цикл, выплаты, управление и события. `tests/mock-ft` — тестовый NEP-141 токен. `tests/sandbox` — интеграционные тесты и Testnet CLI. `examples` — TypeScript-интеграция без встроенных ключей. `scripts` — сборка, проверки, preflight и деплой. GitHub Actions выполняет те же проверки.

Статус фактических проверок и Testnet-развёртывания фиксируется в `docs/reports/VALIDATION.md`. Это первая реализация для проверки и интеграции в Testnet. Автоматические тесты не заменяют независимый аудит перед использованием реальных средств.

Переносимый архив с исходниками и собранным WASM: `python3 scripts/package.py` -> `dist/near-pvp-escrow.zip`. Ключи, node_modules и target исключаются.

Лицензия MIT.
