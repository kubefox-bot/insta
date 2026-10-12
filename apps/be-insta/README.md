# Backend Insta

NestJS API на Bun. Backend владеет авторизацией, бизнес-политикой и canonical
persistence. SvelteKit BFF обращается к нему по REST; web session и browser state
остаются у frontend. Socket.IO доставляет события Conversations, но локальная
публикация события не подтверждает получение клиентом.

## Владельцы и публичные границы

[main.ts](src/main.ts) читает проверенную конфигурацию и запускает приложение.
[app/composition](src/app/composition/index.ts) создаёт инфраструктуру, связывает
порты capabilities и lifecycle. [app/bootstrap.ts](src/app/bootstrap.ts) готовит
Nest, HTTP, realtime и analytics до открытия listener. При ошибке старта
приобретённые стадии закрываются; shutdown ждёт settlement служб до освобождения
клиентов. Watchdog в 15 секунд сообщает отказ, а не успешное завершение эффектов.

| Capability | Публичная граница | Ответственность |
| --- | --- | --- |
| Users | [users/index.ts](src/domains/users/index.ts), [auth/index.ts](src/domains/users/auth/index.ts), [directory/index.ts](src/domains/users/directory/index.ts) | Сессии, регистрация, credentials, поиск публичных пользователей |
| Conversations | [conversations/index.ts](src/domains/conversations/index.ts) | Диалоги, сообщения, история, receipts и outbox dispatch |
| Stories | [stories/index.ts](src/domains/stories/index.ts) | Публикация, feed, publication status, maintenance и lifetime публикаций |
| Privacy | [privacy/index.ts](src/domains/privacy/index.ts) | Cookie preference, ссылка согласия и разрешение optional analytics |
| Support reports | [support-reports/index.ts](src/domains/support-reports/index.ts) | Контракт зависимостей; submission/email входят через transport/server API |

У capabilities отдельные `server/index.ts` для конкретных адаптеров и `http/index.ts`
или `http/server.ts` для transport. Например,
[users/server](src/domains/users/server/index.ts) предоставляет Mongo/Dragonfly,
password и JOSE adapters, а [conversations/server](src/domains/conversations/server/index.ts)
— Mongo и realtime integration. Внешний потребитель использует эти entrypoints;
внутренние файлы импортируются напрямую внутри своего владельца.

`domain/` содержит чистые решения, `use-cases/` — порядок бизнес-операций,
`ports/` — нужные потребителю внешние контракты, `adapters/` — Mongo, Dragonfly,
SMTP, S3 и HTTP/WS реализацию. Mongo session остаётся внутри transaction adapter.
App связывает зависимости и не становится владельцем бизнес-workflow.
`src/lib/` содержит инфраструктурные механизмы без импорта consuming domains.

HTTP DTO backend генерируют OpenAPI и Kubb outputs в `packages/contracts`.
Wire-схемы валидируют внешние данные; доменные модели с другими units/semantics
сохраняют отдельный контракт. Ожидаемые внутренние исходы используют Boxed;
HTTP возвращает сериализуемый envelope, а не экземпляр Result.

## Команды

Из корня workspace, с установленными через mise версиями Bun и зависимостями:

```sh
bun run --cwd apps/be-insta dev
bun run --cwd apps/be-insta build
bun run --cwd apps/be-insta start
bun run --cwd apps/be-insta check
bun run --cwd apps/be-insta test:unit
bun run contracts:check
```

`dev` запускает `src/main.ts` в watch-режиме. `build` собирает `main.ts` и
`app/bootstrap.ts` для Bun с external packages; `start` требует готовый `dist`
и установленные workspace dependencies. Эти команды сами не готовят сервисы.
`check` внутри приложения — TypeScript, не полная приёмка.

Корневой `bun run check` проверяет lint, границы, типы, contracts, unit, сборки
и compatibility. Реальные integration/abuse/E2E запускаются prepared-image
runner-ами по [docs/testing.md](../../docs/testing.md); Core и Full имеют разные
обязательные фазы и точную source/image identity. Unit/build не заменяют их.

## Конфигурация и зависимости

Единственная граница raw environment — [lib/config](src/lib/config/index.ts).
[readServerConfig](src/lib/config/read.ts) принимает явный raw объект,
`readRuntimeConfig` читает `Bun.env`. Схемы проверяют значения до подключения
инфраструктуры; ошибки не печатают секреты. Текущие defaults закреплены в
[config/conts.ts](src/lib/config/conts.ts), а не распределены по use cases.

| Настройка | Контракт |
| --- | --- |
| `API_MONGO_URL` | Обязательная authenticated Mongo URL, database/authSource `insta_api`, replicaSet `rs0`; транзакциям нужен replica set |
| `DRAGONFLY_URL` | Обязательная `redis:`/`rediss:` URL с паролем; generation fencing защищает ephemeral state |
| `AUTH_SIGNING_KEY`, `BFF_SOURCE_SIGNING_KEY` | Обязательные 64 hex-символа; replay/limit keys выводятся отдельными HMAC-контекстами |
| `HOST`, `PORT` | `127.0.0.1`, `3001`; порт — положительное целое до 65535 |
| `REALTIME_ORIGIN` | `https://localhost`; точный HTTP(S) origin без pathname |
| `SMTP_HOST`, `SMTP_PORT`, `MAILPIT_URL` | `mailpit`, `1025`, `http://mailpit:8025` |
| `SUPPORT_RECIPIENT` | `support@insta.test`; только адреса `@insta.test` |
| `SUPPORT_SMTP_HOST`, `SUPPORT_SMTP_PORT` | `mailpit`, `1025`; host ограничен `mailpit`, `localhost`, `127.0.0.1` |
| `LOG_LEVEL` | `info`; допустимы `debug`, `info`, `warn`, `error` |
| `OTEL_RECEIVER_URL` | Необязательная; только HTTP, host `localhost`/`127.0.0.1`/`telemetry-receiver`, путь `/v1/traces`, без credentials/query/hash |
| `STORIES_MODE` | `enabled` по умолчанию; валидированный storage profile обязателен. Явный `disabled` оставляет Core без Stories |

Mongo/Dragonfly timeout по умолчанию — 10 секунд, Mongo pool — 10 соединений.
Mail readiness показывается отдельно от обязательных Mongo/Dragonfly probes.
Privacy necessary mode сохраняет приложение и минимальные operational logs;
optional analytics перед доставкой повторно проверяет актуальное согласие.

## Stories: policy и media

[Stories config owner](src/lib/config/stories/read.ts) при `enabled` требует
`STORIES_ACTIVE_PROFILE` и JSON `STORIES_STORAGE_PROFILES`. Каждый профиль задаёт
уникальный id, endpoint, HTTPS playbackEndpoint, bucket, region, credentials и
prefix. Активный профиль должен присутствовать в списке; retained profiles нужны
для чтения ранее записанных объектов. Browser получает публичную policy через
REST/BFF, не storage profiles или секреты.

`STORIES_MAX_DURATION_MS` по умолчанию 15000; допустимы целые 201–15000 мс.
Recorder safety margin остаётся 200 мс, лимит файла — 20 MiB, активных Stories — 5.
`STORIES_LIFETIME_MS` по умолчанию 86400000; требуется положительное safe integer
и поддерживаемый Date range для суммы с текущим timestamp. Новая policy влияет
на новые публикации; persisted `expiresAt` прежних Stories не пересчитывается.
Источник wire bounds — [contracts/stories](../../packages/contracts/src/stories/policy.ts).

Backend сохраняет действующую проверку MP4/H.264/AAC и WebM с VP8/VP9 и Opus.
Текущий browser recorder использует WebM; это не удаляет MP4-контракт backend.
Контейнер, packet timeline и фактическое декодирование проверяются отдельно;
MIME или metadata duration сами по себе не доказывают пригодность файла.
Media adapter использует worker и `ffprobe`: Linux дополнительно требует
`prlimit`, macOS поддерживает запуск без Linux address-space/CPU limits.
Это различие не доказывает одинаковую abuse-изоляцию двух платформ.

## Безопасная диагностика

`/health/live` проверяет доступность процесса. `/health/ready` отвечает без кеша,
503 означает отказ обязательной зависимости; `mail: degraded` отражает mail-путь
отдельно. Размер заголовков проверяется и на диагностических маршрутах.
Swagger маршруты определены в [app/docs/conts.ts](src/app/docs/conts.ts).

Для поиска ошибки используй requestId/operationId и безопасные diagnostic codes.
Не добавляй тела сообщений, JWT, cookies, SMTP payload, storage credentials или
сырые request/response в logs. Не очищай developer collections/volumes для
получения зелёного теста. Записывай фактически выполненные фазы, исходный fail,
retry и оставшиеся manual/compatibility gaps; исторический receipt не подтверждает
новый source commit.
