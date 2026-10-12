# Insta: авторизация и чат

Реализована локальная основа: регистрация с email OTP, вход и web sessions,
каталог пользователей, приватные диалоги, история, realtime и offline outbox,
поддержка, EN/RU и cookie preferences. Frontend/BFF — SvelteKit, backend — Nest;
BFF обращается к Nest по REST. Stories включены по умолчанию и реализуют запись
нативного WebM VP8/VP9+Opus, preview, публикацию и гостевое воспроизведение
через RustFS/S3; прежний MP4 H.264/AAC path сохранён. Core-only включается
явным `STORIES_MODE=disabled`. Лимиты видео: 15 секунд, 20 MiB, capture до 720p; запись
останавливается на 14800 ms, сервер проверяет весь файл без remux/transcoding.
Порядок приёмки и разделение source checks, runtime-фаз и ручных аппаратных
проверок описаны в [документации тестирования](./docs/testing.md) и
[совместимости браузеров](./docs/browser-compatibility.md).

Realtime использует WebSocket с apply ACK и дедупликацией. Основной replay
хранится 24 часа в отдельном Dragonfly Streams; Mongo хранит атомарный outbox
и компактный journal для восстановления. Периодический REST polling отсутствует.
Готовность реализации и фактическую приёмку следует проверять отдельно.

- `apps/fe-insta` — SvelteKit frontend и BFF, владелец web sessions.
- `apps/be-insta` — Nest backend, владелец бизнес-политики и canonical persistence.
- [packages/fe-core](./packages/fe-core/README.md) — Biome, архитектурные проверки,
  CLI и общий TS config без приватного registry.
- [Архитектура](./docs/architecture.md), [локальный runbook](./docs/local-runbook.md)
  и [история решений](./docs/implementation-decisions.md) описывают фактические границы.

**Для первого запуска и сдачи начни с [короткого руководства](./docs/handover.md).**

## Локальные проверки

Требуются mise, Bun 1.4.2, Lefthook 2.1.12, Git, OpenSSL и уже работающий
локальный Docker daemon. Версии Bun/Lefthook закреплены в `mise.toml`.

```sh
mise install
bun install --frozen-lockfile
bun run check
```

Команды доступны отдельно: `lint`, `lint:boundaries`, `typecheck`, `test`, `build`.
`format` применяет форматирование. Проверки работают и до первого коммита.
В скачанном архиве без `.git` сначала требуется `git init`.

`check` проверяет lint, границы, типы, contracts/unit, сборки и compatibility.
Integration, abuse и Playwright — отдельные фазы; команды и точная provenance
результатов находятся в [testing.md](./docs/testing.md). Принятая core-матрица
BASE585d056/run9b6879fa прошла 13 фаз, 39 обязательных частей; 14 частей
отложены. Это receipt указанного source/images, не автоматическое доказательство
каждого последующего commit. Финальная сборка DONE-03 и независимое review
фиксируются отдельно. Известны native forced QUIC gap и исторический SSR proxy
flake с неизвестной причиной; [границы совместимости](./docs/browser-compatibility.md).

## Локальный запуск

Из корня checkout доступны два режима через mise:

```sh
# Оба приложения, зависимости, Stories и HTTPS proxy в Docker:
mise run compose:up
# Vite с HMR против уже работающего Docker backend:
mise run dev:frontend
# Только чат без Stories:
STORIES_MODE=disabled mise run compose:up
# Отдельные Docker-приложения: mise run compose:backend / compose:frontend

# Безопасная остановка выбранного project, volumes сохраняются:
mise run compose:down
```

Подготовка отсутствующих приватных credentials/certificate выполняется командами
startup; отдельная команда — `mise run infra:prepare`. Не копируй пустые секреты
из .env.example. Startup сохраняет существующие значения. Используется локальный
Docker endpoint выбранного Docker CLI context (или `DOCKER_HOST`, если задан),
project insta-core. Приложение:
[https://localhost](https://localhost), Mailpit:
[http://localhost:18025](http://localhost:18025). Системное доверие CA не меняется.
`mise run dev:frontend` использует `https://localhost:5173`, отдельный HTTPS HMR
на loopback `127.0.0.1:5174` (`VITE_HMR_PORT` меняет порт) и realtime proxy.
Команда требует здоровый `be-insta`, работающие Mongo и Dragonfly, а также
сохранённые Docker metadata/image `fe-insta`. Если стенд уже работает, запускай
только эту команду: она не перезапускает backend и остальные Compose-сервисы.
`infra:up` поднимает только инфраструктурные зависимости; для первого полного
старта используй `compose:up`. Остановка локального Vite завершает только его
процесс и принадлежащие ему Mongo/Dragonfly relay-контейнеры.
Frontend без backend сохраняет live200, readiness503; чат доступен после
возвращения API. Раздельная сборка: `mise run build:frontend` / `build:backend`.

Swagger UI: [https://localhost/docs](https://localhost/docs). `--cacert` доверяет
локальному сертификату только в данной команде; установка CA в системное доверие
требует отдельного разрешения. Production domain/ACME здесь не настроены.

[Инфраструктура](./docs/local-infrastructure.md) описывает host ports, выбор
project, independent commands, DNS ограничения свежей сборки и custom HTTPS port.
Процедуры проверки контейнеров и ограничения приёмки описаны в
[документации тестирования](./docs/testing.md). Для ручного
просмотра зарегистрируй synthetic address и прочитай OTP в своём Mailpit;
обычный startup не создаёт demo accounts.

## Локальные Git hooks

После `mise install` и установки workspace зависимостей:

```sh
# Один раз для нового клона; в текущем репозитории уже включено.
git config --local extensions.worktreeConfig true
bun run hooks:install
# Повторная установка проверяет и обновляет только собственные hooks.
bun run hooks:install
```

Установщик задаёт `core.hooksPath` только через `git config --worktree` и
сохраняет hooks в `insta-hooks` внутри Git metadata текущего checkout/worktree.
Общая конфигурация hooks и hooks основного checkout не перезаписываются.
Нативные Lefthook wrappers сначала создаются в отдельном временном Git repo,
затем копируются в текущую worktree: общая `.git/info/lefthook.checksum` тоже
сохраняется. `no_auto_install` отключает неявную синхронизацию при коммите;
после изменения конфигурации следует снова запустить `hooks:install`.
Если Lefthook недоступен, установленный hook завершится с ошибкой.
Если уже есть активные чужие hooks или другой заданный `core.hooksPath`, установка
останавливается и сохраняет их. Для архива сначала нужен `git init`.
Lefthook доставляется через mise как готовый бинарник; Bun исполняет наши TS
скрипты. Дополнительный npm commitlint и его install hooks не требуются.

`pre-commit` выполняет `lint`, `lint:boundaries` и `typecheck` без записи
форматирования. `typecheck` включает fe-core и root architecture/tooling tests.
`commit-msg` читает только первую строку, включая CRLF, и требует
`type: конкретное описание` или `type(scope): конкретное описание`.
Разрешены `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `build`, `ci`;
описание содержит минимум 8 символов и 2 слова. Пустой type, неизвестный type,
пустое/короткое/однословное и общее описание отклоняются. Scope необязателен;
Jira, branch exemptions и сетевые проверки не используются.

```sh
bun run commitlint "/path with spaces/commit-message.txt"
mise exec -- bun test __tests__/tooling --timeout 30000
bun run check
git config --show-origin --get core.hooksPath
```

Чистый API `parseCommitMessage` / `validateCommitMessage` доступен через
`@insta/fe-core/git/commit-message`. Проверки hooks создают отдельные временные
Git repositories; они доказывают отказ коммита без изменения HEAD, принятие
корректного subject с body и сохранение отказа каждой pre-commit проверки.

## UI и текущая приёмка

[Локальный UI kit](./packages/ui-kit/README.md) предоставляет Svelte-компоненты
через `@insta/ui-kit` и единственный публичный stylesheet. Приложение владеет
RU/EN copy, auth, draft и приватным состоянием. Desktop от 768px показывает чат
слева и список справа; mobile переключает list/detail. В header доступны вход,
регистрация или username/выход. После повторного входа восстановленный черновик
требует явной отправки; reload теряет незаписанный текст.

```sh
bun run --cwd packages/ui-kit check
bun run test:ui
```

Актуальные проверки и их ограничения описаны в
[документации тестирования](./docs/testing.md). Значение
`font-family: Inter` само по себе не доказывает доступность шрифта. Username
показывается из уже загруженного разрешённого поиска; после reload доступен
нейтральный fallback до загрузки имени. Публичного guest composer нет.
