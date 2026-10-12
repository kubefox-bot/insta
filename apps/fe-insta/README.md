# Frontend и BFF Insta

SvelteKit-приложение объединяет SSR, браузерный интерфейс и BFF. Браузер обращается
к локальным `/api/*`; BFF вызывает Nest через REST и generated SDK. BFF хранит
web-session binding и защищённые cookie, а Nest отвечает за авторизацию,
бизнес-правила и канонические данные. Transport между ними остаётся REST.

## Владельцы и публичные API

- [src/routes](src/routes) и [hooks.server.ts](src/hooks.server.ts) — Kit transport,
  SSR и подключение жизненного цикла. [src/app](src/app) собирает зависимости,
  инфраструктуру и runtime; бизнес-сценарии остаются у своих capabilities.
- [users/browser](src/domains/users/browser/index.ts) — `createAuthBrowser`,
  `createAuthSynchronization`, `UserSearch`, `AuthDialog` и auth context keys.
  [users/server](src/domains/users/server/index.ts) — `loadSession`, login,
  registration, directory и ticket request operations.
- [conversations/browser](src/domains/conversations/browser/index.ts) — UI,
  `createConversationStore`, transport, outbox и receipts.
  [browser/state](src/domains/conversations/browser/state/index.ts) — отдельный
  headless state API; [conversations/server](src/domains/conversations/server/index.ts)
  — чтение списка/истории, отправка и подтверждение receipts.
- [stories/browser](src/domains/stories/browser/index.ts) — feed/player,
  preview/recorder и lifecycle создания;
  [stories/server](src/domains/stories/server/index.ts) — feed, streaming playback,
  publication и загрузка публичной policy.
- [privacy/browser](src/domains/privacy/browser/index.ts) и
  [privacy/server](src/domains/privacy/server/index.ts) владеют предпочтениями
  cookie и разрешением optional telemetry. Necessary сохраняет работу приложения;
  Faro и клиентские метрики требуют актуального согласия.
- [auth-continuation/browser](src/domains/auth-continuation/browser/index.ts) и
  [auth-continuation/server](src/domains/auth-continuation/server/index.ts) владеют
  выбором и восстановлением expiring intents. Dragonfly хранит intent и защищённый
  browser context, а не текст сообщения или видеоблоб. После входа требуется
  явное подтверждение продолжения.
- [support-reports/browser](src/domains/support-reports/browser/index.ts) и
  [support-reports/server](src/domains/support-reports/server/index.ts) предоставляют
  форму, выдачу её контекста и отправку обращения.

Внешние потребители используют эти entrypoints, а внутренние файлы — прямые
импорты внутри владельца. [API boundary config](api-boundaries.config.json) и
[module boundary config](module-boundaries.config.json) задают проверяемые границы.
Серверные API, ключи, Mongo/Dragonfly clients и generated backend SDK не входят
в browser graph. Общие механизмы находятся в `src/lib`, переносимые инструменты —
в `@insta/fe-core`; shared packages не импортируют application domains.

## Состояние, UI и ресурсы

Корневой [layout](src/routes/+layout.svelte) создаёт browser capabilities и передаёт
их через узкие Svelte context contracts. UI читает readable view и вызывает
именованные операции; writable state принадлежит модулю. Auth/messages/conversations
используют Svelte stores, локальное UI-состояние — runes. Пользовательское состояние
нельзя разделять между SSR-запросами. Context предназначен для UI composition,
не для поиска зависимостей внутри use case.

Компоненты расположены в `components/ComponentName/index.svelte` с локальными
`props.ts`, `styles.module.css` и supporting operations по необходимости.
CSS Modules остаются основным способом авторских стилей; resets и theme имеют
отдельного глобального владельца. Copy находится в [каталогах i18n](src/lib/i18n).
Смена локали сохраняет cookie и обновляет данные Kit; даты и числа показывает Intl.

Владелец mount/runtime освобождает subscriptions, timers, WebSocket,
BroadcastChannel, IndexedDB и media resources через возвращённые release/dispose
операции. Preview/blob URL и recorder нельзя оставлять после закрытия их владельца.
Logout очищает приватное состояние; late async results должны учитывать identity
и жизненный цикл. Запрос отмены потока сам по себе не доказывает его settlement.

## Конфигурация и контракты

[src/lib/config/server](src/lib/config/server/index.ts) — валидированный владелец
runtime environment. Он проверяет `API_BASE_URL`, `API_TIMEOUT_MS`,
`API_MAX_RESPONSE_BYTES`, `WEB_MONGO_URL`, `SESSION_ENCRYPTION_KEY`,
`BFF_SOURCE_SIGNING_KEY`, `TRUSTED_WEB_PROXY_HOST` и `LOG_LEVEL`;
отдельные accessors читают `DRAGONFLY_URL` и необязательный `FARO_RECEIVER_URL`.
Схемы и defaults находятся рядом с владельцем. Composition получает проверенные
значения; domain code не читает окружение. Серверные config objects не передаются
целиком в браузер.

`STORIES_MODE` включает Stories в BFF и включён по умолчанию. Core-only запускается
явным `STORIES_MODE=disabled`. Upload duration
и lifetime принадлежат backend: публичная policy проходит через generated REST
client, проверку envelope в BFF и SSR data. Браузер не получает storage profiles
или секреты и не вычисляет runtime policy из test-only config. При недоступной
policy создание записи не должно подменять её произвольными лимитами. Текущая
нативная запись — WebM VP8/VP9+Opus; backend сохраняет совместимость с прежним
MP4 H.264/AAC. Изменение или удаление существующих публичных compatibility exports
требует отдельного разбора потребителей; эта документация их не отменяет.

[kubb.config.ts](kubb.config.ts) генерирует wire types, Zod schemas и clients из
backend OpenAPI. Generated файлы не редактируют вручную. Wire DTO валидируют на
границе; отличающиеся domain contracts сохраняют свои units и смысл. Серверный
[API service](src/lib/api/server/index.ts) различает network, invalid_contract и
backend error. Ky transport не повторяет запросы автоматически; streaming Stories
и action deserialize имеют отдельные контракты.

## Команды

Из корня workspace с установленными через mise инструментами и dependencies:

```sh
bun run --cwd apps/fe-insta dev
bun run --cwd apps/fe-insta check
bun run --cwd apps/fe-insta test:unit
bun run --cwd apps/fe-insta test:compiler
bun run --cwd apps/fe-insta test:config
bun run --cwd apps/fe-insta build
bun run --cwd apps/fe-insta start
bun run contracts:generate
bun run contracts:check
```

`check` выполняет Kit sync и svelte-check с tsgo. `build` создаёт Bun adapter
output и observability preload; `start` использует оба артефакта из `dist`.
Серверу нужны валидное окружение и доступные зависимости; одна frontend-команда
их не поднимает. Для согласованного host-dev запуска используй
`mise run dev:frontend` из [руководства workspace](../../README.md).
[vite.config.ts](vite.config.ts) владеет Kit/Bun adapter, CSP, CSS и SSR настройками.
Host-dev config проверяет localhost origins и отдельный WSS HMR port; локальные
сертификаты читаются из `infra/certs`, системное доверие автоматически не меняется.

## Проверки и диагностика

При проблемах сначала различай config validation, backend REST envelope,
BFF cookie/session и browser state. Для корреляции используй request ID и
безопасные серверные логи; cookie, токены и видеоблобы не прикладывают к отчётам.

Root `bun run check` проверяет source/tooling/contracts/build, но не заменяет
реальные integration, abuse и E2E. Core/Full, подготовку изолированных ресурсов,
source/image receipts и browser проверки описывает [docs/testing.md](../../docs/testing.md).
Core отдельно проверяет Stories-disabled режим. Успешный svelte-check не доказывает
работу камеры, playback, транзакций или shutdown; каждый фактически выполненный
этап и оставшийся manual/compatibility gap записывают отдельно.
