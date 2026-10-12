# Insta: запуск и устройство проекта

Это локальное приложение с регистрацией по email, личными диалогами, сообщениями
в реальном времени и Stories. Интерфейс и BFF работают на SvelteKit, backend —
на Nest. Команды ниже выполняются из корня репозитория.

## Первый запуск

Нужны Git, mise, OpenSSL и запущенный Docker Engine, например Docker Desktop.
Скрипты используют endpoint выбранного Docker CLI context; заданный `DOCKER_HOST`
служит явным переопределением. Поддерживаются локальные Unix sockets и Windows
named pipes. Версии инструментов закреплены в `mise.toml`.

```sh
mise install
bun install --frozen-lockfile
mise run compose:up
```

Первый запуск создаёт отсутствующие локальные секреты и сертификат, поднимает
Mongo, отдельные auth/delivery Dragonfly, Mailpit и RustFS, готовит приватный bucket Stories, собирает
и запускает оба приложения с HTTPS proxy. Он может занять несколько минут.
Повторный запуск сохраняет `.env`, `.infra/`, `infra/certs/` и Docker volumes;
эти приватные файлы не входят в Git.

Приложение открывается на [https://localhost](https://localhost), письмо с кодом
регистрации — в [Mailpit](http://localhost:18025). Сертификат самоподписанный и
не устанавливается в системное доверие. Готовность backend проверяется так:

```sh
curl --cacert infra/certs/localhost.crt https://localhost/api/health/ready
```

`mise run compose:down` останавливает выбранный Compose project, сохраняя
аккаунты, переписку, секреты и volumes. Для отдельного стенда выбери собственное
`COMPOSE_PROJECT_NAME=insta-...` и свободные порты; подробности есть в
[руководстве по инфраструктуре](local-infrastructure.md).

## Основные команды

| Команда | Что делает |
| --- | --- |
| `mise run compose:up` | Полный Docker-стенд с HTTPS и Stories. |
| `mise run compose:backend` | Docker backend и его зависимости. |
| `mise run compose:frontend` | Docker frontend/BFF и его зависимости; backend запускается отдельно. |
| `mise run infra:up` | Зависимости для приложений на хосте. |
| `mise run dev:backend` | Nest на хосте. |
| `mise run dev:frontend` | Vite с HMR против уже работающего Docker backend. |
| `mise run dev` | Оба приложения на хосте с инфраструктурой. |
| `mise run compose:down` | Остановить свой project с сохранением данных. |
| `bun run check` | Lint, границы, типы, тесты, контракты и сборки. |
| `bun run contracts:check` | Проверить согласованность OpenAPI и generated clients. |

Для разработки интерфейса после `compose:up` обычно достаточно отдельной команды
`mise run dev:frontend`: Vite доступен на `https://localhost:5173`, backend и
базы остаются в Docker. Для запуска приложений на хосте сначала выполни
`mise run infra:up`, затем `mise run dev` либо отдельные `dev:*` команды.
Host и container режимы одного Compose project не смешиваются.

## Stories и настройки

Stories включены по умолчанию. Только чат запускается так:

```sh
STORIES_MODE=disabled mise run compose:up
```

Режим из shell применяется к Compose и приложениям вместе, даже если сохранённый
`.env` содержит другое значение. Локальный профиль RustFS получает playback URL
с выбранным `HTTPS_PORT`; явно заданные внешние storage profiles сохраняют свои
URL. При нестандартном порте открывай `https://localhost:<порт>` напрямую.

Backend ограничивает видео 15 секундами и 20 MiB. `STORIES_MAX_DURATION_MS`
может уменьшить, но не увеличить предел 15000 мс; минимум — 201 мс.
`STORIES_LIFETIME_MS` задаёт срок новых публикаций, по умолчанию 86400000 мс
(24 часа). Уже опубликованные Stories сохраняют свой `expiresAt`. Браузер
записывает WebM; backend продолжает принимать и воспроизводить MP4.
Схема конфигурации описана в [README backend](../apps/be-insta/README.md).

## Дизайн кода

Это [модульный монолит](architecture.md). `apps/fe-insta` владеет интерфейсом,
browser state, web sessions и BFF. `apps/be-insta` владеет бизнес-правилами,
авторизацией и каноническими данными. BFF общается с Nest по REST; backend HTTP
DTO генерируют OpenAPI и клиентские типы.

Домены названы языком продукта: `users`, `conversations`, `stories`, `privacy`,
`support-reports`. Сценарии находятся в `use-cases/`, чистые правила — в
`domain/`, контракты внешних зависимостей — в `ports/`, работа с Mongo,
Dragonfly, HTTP или S3 — в `adapters/`. `app/` собирает зависимости и управляет
жизненным циклом. CSS Modules лежат рядом с компонентами; browser/server
entrypoints разделены. Такое разделение позволяет вынести capability в пакет,
сохраняя её бизнес-сценарии.

## Проверка перед сдачей

```sh
bun run check
git status --short
```

`bun run check` проверяет исходники и сборки. Полная проверка с реальными
провайдерами, браузером, нагрузочными сценариями и камерой выполняется отдельно
на подготовленных образах по [документации тестирования](testing.md).
Исторические результаты относятся только к своим исходникам и образам.
Документация API доступна на [https://localhost/docs](https://localhost/docs)
при запущенном стенде.

Realtime работает через WS с подтверждением применения и дедупликацией.
Выделенный delivery Dragonfly хранит replay 24 часа; Mongo journal остаётся
источником восстановления. Периодический REST polling не используется.
Проверяйте delivery readiness отдельно от доступности HTTP/auth.

Локальные AI-планы и промежуточные отчёты не входят в поставку. Документация
для запуска и проверки не требует доступа к ним. Фактические результаты
текущего прогона и незавершённые фазы перечислены в [testing.md](testing.md).

## Доступ к чужому диалогу, 2026-10-21

Исправлено: HTTP 403/404 и отказ WS-подписки показывают «Чат недоступен» без composer и кнопки повтора. Отказ доступа очищает ранее закешированные сообщения; временная ошибка сервиса сохраняет возможность повторить чтение. После смены пользователя, включая выход и последующий вход, detail route заменяется списком `/conversations`. Первая авторизация и обновление сессии того же пользователя не считаются сменой аккаунта. Проверки и ограничения приёмки — в docs/testing.md.
