# Локальный стенд: host или контейнеры

Все команды запускаются из корня checkout через mise (Bun 1.4.2). Нужны
установленные mise tools, зависимости workspace, OpenSSL и работающий Docker.
Скрипты используют локальный endpoint выбранного Docker CLI context; заданный
`DOCKER_HOST` служит явным переопределением. Поддерживаются локальные Unix sockets
и Windows named pipes; удалённые TCP/SSH endpoints отклоняются. Для Docker Desktop
выбери его context командой `docker context use <имя>` и убери явный `DOCKER_HOST`,
если он указывает на другой daemon. Скрипты не меняют выбранный context.

`mise run infra:prepare` создаёт только отсутствующие credentials/certificate,
сохраняет существующие значения и проверяет private files. Не копируй пустые
значения из .env.example. .env, .infra и infra/certs игнорируются Git;
каталоги 0700, файлы 0600. Symlink, чужой владелец и неполная certificate pair
вызывают отказ. Самоподписанный localhost certificate действует 30 дней;
команды не меняют системное доверие.

## Host development

`infra:up` запускает Mongo, Dragonfly, Mailpit и init jobs; при включённых
Stories также поднимает RustFS и готовит приватный bucket. Приложения
работают на хосте; Traefik добавляется при запуске frontend. Для backend-only
Traefik не нужен. В одном выбранном project можно запускать приложения отдельно
в разных терминалах:

```sh
mise run infra:up
mise run dev:backend
# В другом терминале:
mise run dev:frontend
# Либо оба приложения одной командой:
mise run dev
```

По умолчанию host Mongo27017, Dragonfly6379, SMTP1025, app3000/3001,
HTTP80/HTTPS443, Mailpit18025. Инфраструктурные host ports опубликованы только
на127.0.0.1. Replica-set member сохраняется mongo:27017; host URI использует
replicaSet=rs0&directConnection=true. Config owner передаёт отдельные Mongo
credentials и signing/encryption settings только нужному app. Ctrl-C завершает
собственные app process groups, ожидая settlement; detached infrastructure
сохраняется до явной compose:down. Standalone frontend без API отдаёт live200,
readiness503; полноценный чат требует backend.

## Container development

Frontend и backend собираются независимо, имеют собственные dist/runtime
workspace packages и user bun; source/dependency mounts у приложений отсутствуют.
Frontend не зависит от health/startup backend. Выбранные команды:

```sh
mise run compose:backend
mise run compose:frontend
mise run compose:up
mise run compose:down
```

`compose:backend` собирает и запускает Nest с необходимой инфраструктурой;
`compose:frontend` — BFF/frontend с его Mongo/Dragonfly и включёнными по
умолчанию Stories, без backend и Traefik.
`compose:up` запускает оба app и proxy. Health frontend проверяет процесс,
отдельная readiness проверяет Mongo и API. Backend можно остановить/вернуть
без пересоздания frontend. Пересборка выбранного app сохраняет другой app,
базы и live broker generation. Старый `bun run infra:up` — alias полного
Compose, он отличается от `mise run infra:up`.

Только локальная сборка выбранного приложения без Docker startup:

```sh
mise run build:backend
mise run build:frontend
```

Не смешивай host/container режимы в одном project: command owner проверяет mode,
working directory и занятые порты до изменений. Сначала останови свой project,
сохранив volumes. Другой checkout/project с developer data не переиспользуй.
Чтобы держать отдельный стенд, выбери новый COMPOSE_PROJECT_NAME вида insta-* и
свободные FE_PORT, BE_PORT, HTTP_PORT, HTTPS_PORT, MAILPIT_PORT; host дополнительно
HOST_MONGO_PORT, HOST_DRAGONFLY_PORT, HOST_SMTP_PORT. WEB_ORIGIN — canonical HTTPS localhost
origin, например https://localhost:24444. В container mode custom HTTP port
redirect пока ведёт на443: обращайся напрямую к выбранному HTTPS origin.
Host proxy формирует redirect на выбранный HTTPS_PORT.
Локальный профиль RustFS подписывает playback URL с этим же HTTPS-портом.
Внешние storage profiles сохраняют свои публичные URL. Режим
`STORIES_MODE=disabled` из shell применяется к Compose и приложениям при запуске,
даже если сохранённый `.env` содержит `enabled`.

```sh
COMPOSE_PROJECT_NAME=insta-local-dev FE_PORT=23000 BE_PORT=23001 \
  HTTP_PORT=28080 HTTPS_PORT=24443 MAILPIT_PORT=28025 mise run compose:up
curl --cacert infra/certs/localhost.crt https://localhost:24443/api/health/ready
COMPOSE_PROJECT_NAME=insta-local-dev mise run compose:down
```

Вход по умолчанию [https://localhost](https://localhost), Mailpit
[http://localhost:18025](http://localhost:18025). Container Mongo/Dragonfly/SMTP
не публикуются на хост. Остановка сохраняет volumes, credentials и сертификаты.
После изменения Traefik config нужен restart его собственного контейнера:
file provider намеренно не следит за файлами.

## Сборка и DNS

Portable default использует DNS Docker build network. На текущей машине
BuildKit resolver192.168.5.3 не разрешает public names, поэтому fresh install/apt
могут завершиться ошибкой. Acceptance сборки использовали только per-command
--add-host для заново разрешённых на хосте registry.npmjs.org и deb.debian.org;
IP не закреплены в source/config, daemon/context не менялись. Если требуется
этот обход, разреши адреса заново и передай --add-host в отдельную Docker build.
Host runner по умолчанию тоже собирает dependencies target. Явный
INSTA_INFRA_BUILD=skip пригоден только при уже подготовленном правильном
bootstrap image и не доказывает fresh image acceptance.

## Владение и готовность

Mongo 8.0.15 — single-node replica set `rs0`, постоянный volume. `insta_api` и
`insta_web` имеют разные credentials и `readWrite` только собственной базы.
Nest/BFF получают подключение с lifecycle; доменные адаптеры владеют своими
коллекциями, indexes и retention. Use cases не получают Mongo Db/ClientSession.
Текущие schemas/ownership перечислены в [runbook](local-runbook.md).

`/health/live` Nest проверяет процесс. `/health/ready` проверяет Mongo и атомарный
Dragonfly generation fence, возвращает 503 при отказе обязательной зависимости.
Mailpit отражается как `mail: degraded`, не разрешая обход auth. Required admission
проверяет только Mongo/broker; optional mail probe не задерживает private handlers.
Stories maintenance хранит `degraded`/recovery в owning `jobs.status()`, но не
закрывает HTTP здорового Core. Ошибки storage остаются в Stories capability;
health HTTP DTO не расширяется состоянием фоновых Stories jobs.
Health mail probe ограничен 500ms; runtime BFF требует `API_TIMEOUT_MS >= 1000`
(default10000ms), чтобы optional probe помещался в HTTP budget. Более короткое
значение отклоняется безопасной config error. Низкоуровневый API transport
сохраняет возможность отдельных коротких deadlines. Приложение
отклоняет запросы к private handlers до их выполнения при закрытом
admission. BFF `/api/health/ready` проверяет свою базу и валидированный Nest DTO
через существующий generated client/service. OpenAPI экспортируется без secrets
и подключения к инфраструктуре; compatibility provider существует только в тестах.

Лимиты: JSON 64 KiB, headers 16 KiB, общий multipart envelope 21 MiB. Multipart
лимит применяется к включённым Stories: исходный WebM или сохранённый MP4 path не более 20 MiB.
Публикация удерживает максимум два физических upload/provider lifetime на runtime;
abort не освобождает слот до фактического settlement. Бизнес-лимит пяти активных
историй автора проверяется независимо. Traefik не повторяет мутации и не переписывает signed URLs.
SvelteKit сам формирует nonce/hash CSP, proxy добавляет остальные security headers.
Приватные `/api` и `/event` ответы имеют `Cache-Control: no-store`.

## Dragonfly: bootstrap и холодное восстановление

Поддерживается закреплённый standalone master Dragonfly 1.34.2, без promotion,
replication и hot in-place restore. INFO server у этого provider не содержит
`run_id`. `master_replid` генерируется один раз при создании ServerFamily:
[исходник v1.34.2](https://github.com/dragonflydb/dragonfly/blob/v1.34.2/src/server/server_family.cc#L1026).
Проверка INFO replication внутри Lua и реальный cold snapshot restore входят в тест.

Infrastructure job `broker-init` атомарно связывает generation с текущим
`master_replid`. Само приложение никогда не ротирует generation. После cold
restart/restore старая snapshot marker не проходит Lua fence; до bootstrap
readiness/admission закрыты. `evaluateFenced` проверяет process identity и
expected generation в том же Lua script, что и операция, и добавляет generation
к ключам auth-state. Новое поколение не видит старые challenge/ticket/intent/consent.
Auth/privacy adapters выполняют чтение/consume только через этот
API и передавать поколение своего auth context. Сам `RedisClient` не является
безопасным auth-store API. Lua script является доверенным кодом адаптера, не вводом
пользователя. Обычный restart приложения сохраняет live generation.

После ручного restart Dragonfly выполнить bootstrap job, затем перезапустить
приложения: reconnect намеренно fail-closed; remote private операции закрыты до
готовности. Browser offline queue сохраняет локальные pending записи и требует
current owner/generation reconciliation при возвращении online.

```sh
docker compose --project-name insta-core run --rm broker-init
docker compose --project-name insta-core restart be-insta fe-insta
```

Это порядок локального запуска, не автоматизация production restore. Snapshot не
делает Streams lossless: workers восстанавливают durable outbox из Mongo.
Состояние временного auth-store после restore нельзя принимать до bootstrap.
Обычный idle не закрывает соединение: native idle timeout выключен. Deadline
required generation probe отдельно ограничен конфигурацией; при его превышении
owner закрывает connection и остаётся fail-closed до restart, без reconnect/replay.
Bun RedisClient проверен для EVAL, XADD, XREADGROUP, XAUTOCLAIM, XACK и отмены
блокирующего чтения закрытием отдельного клиента. Требования будущего worker:
своя blocking connection, явное владение lifecycle и generation fence для auth.

## Проверки и ограничения

```sh
bun run check
bun run test:integration
bun run test:integration __tests__/integration/broker-restore.host.test.ts
bun run test:abuse
bun run test:e2e
bun run check:full
```

Runner принимает фазу и необязательные paths. Без paths выполняет все тесты фазы;
с paths — только указанные сценарии (setup зависимостей сохраняется). Paths вне
фазы отклоняются. Core provider/abuse/Playwright owners реализованы; runner требует
exact prepared images и phase receipts. `--scope=full` требует enabled private Stories profile и pinned RustFS
в выделенном `insta-stories`; `core` остаётся отдельным disabled scope. Точные команды/результаты находятся в
[testing.md](testing.md); foundation integration не заменяет product acceptance.

Testhost подключается к локальной Compose-сети. Тесты используют случайные
run-owned коллекции/ключи и чистят только их. Cold restore использует отдельный
Dragonfly volume; proxy smoke — отдельную сеть, transport fixture и Traefik с тем
же routing config. Удаляются только созданные resources с проверенным ownership.
Persistence smoke перезапускает Mongo/BFF/Nest текущего core-стенда: во время
этого теста не следует работать в приложении. Основные volumes сохраняются.

Proxy fixture доказывает `/event` polling/upgrade и `/eventual` frontend routing,
TCP HTTP/1.1 fallback, scoped CA TLS и обработку non-JSON 502 существующим API
service. Authenticated Socket.io gateway и browser journeys проверены отдельными
core owners; этот proxy smoke их не заменяет. Отдельный scoped-CA curl на основном стенде
согласовал HTTP/2. Внешние 443/TCP+UDP настроены; поддержка HTTP/3
не равна фактически согласованному h3 с доверенным браузерным сертификатом.
Actual internal Docker h3 diagnostic PASS и native forced QUIC failures описаны
в [browser compatibility](browser-compatibility.md).

Все vendor manifests закреплены digest и содержат linux/arm64 и linux/amd64.
Фактически исполнена только linux/arm64 на локальном Docker daemon. Обычный
первый build требует загрузки npm dependencies; не следует считать зависшую
подготовку успешным тестом. Логи/diagnostics не публиковать без проверки: Docker
inspect/rendered Compose могут содержать локальные credentials.

## Доверенный HTTP source для limiter

BFF использует реальный peer из default Bun adapter `getClientAddress`; `ADDRESS_HEADER`
не задаётся. `TRUSTED_WEB_PROXY_HOST=traefik` в Compose разрешает ровно адреса этого
явно известного proxy, полученные через DNS. Только от такого peer принимается
один валидный `X-Forwarded-For`; цепочка, неизвестный peer и ошибка разрешения
переходят к реальному peer. Traefik с default forwarded handling очищает поддельный
forwarded input от недоверенного ingress. Прямые порты приложений не публикуются.

Resolution выполняется только при сохранении, coalesced и без фонового таймера:
lease30s, DNS timeout500ms/tries1, Resolver отменяется владельцем. После истечения
lease новый lookup заменяет список адресов; failed lookup не использует прежний
список и кеширует пустой результат30s. После recreate proxy прежний точный IP
может оставаться доверенным до конца30s lease, новый IP получает доверие после
refresh. Во время отказа DNS source fallback может объединять quota за peer proxy;
он не разрешает mint произвольного source. Это явная деградация, не silent trust.

`BFF_SOURCE_SIGNING_KEY` — отдельный обязательный shared64hexkey BFF/Nest. Local
prepare добавляет его только при отсутствии, сохраняя прежние credentials.
BFF игнорирует входные internal assertions и формирует HMAC для normalized source
SHA256 digest + timestamp + method + pathname. Nest проверяет constant-time signature,
возраст не более60s и clock future skew не более5s; absent/invalid/stale assertion
использует реальный native peer. Это технический source contract, не auth token
и не browser/analytics identity. Privacy use case получает уже доверенный digest;
policy10 изменений/min, namespaces и generation fence сохранены.

## WS at-least-once: capacity gate 2026-10-20 (Task 3)

Общий Dragonfly `256mb` не выдержал принятую retained Streams нагрузку:
24 h, aggregate 3 entries/s, message text 1 KiB и фактический unread fan-out.
Первый OOM наступил на 232 388 из 259 200 entries, одновременно перестал
работать auth ticket probe. Conservative all-conversation профиль дал OOM
на 129 100 entries; даже 1/s не вместил cold restore с оставшейся старой
physical generation. Retention не сокращалась, shared Compose не менялся.

Auth broker сохраняет 256 МБ; delivery использует отдельный pinned Dragonfly
1.34.2, maxmemory 1gb и container limit 1536 MiB. Его volume
`dragonfly-delivery-data`, пароль и `infra:delivery-generation` независимы.
Source composition требует `DELIVERY_DRAGONFLY_URL` и явный `deliveryBroker`;
endpoint auth запрещён, включая другое DNS-имя того же процесса. Physical identity
проверяется до первой delivery-команды при каждом новом подключении.

`infra:prepare` добавляет только отсутствующий `DELIVERY_DRAGONFLY_PASSWORD`
через существующий owner environment; сохранённые секреты, Mongo key, сертификаты
и volumes не заменяются. Compose передаёт отдельный URL backend/testhost;
`delivery-broker-init` запускает отдельный bootstrap без auth invalidation.
Host dev использует `HOST_DELIVERY_DRAGONFLY_PORT` (по умолчанию 6380).
Изменение Compose source само по себе не означает подготовку работающего окружения.

При outage delivery подключается lazy: auth/Mongo admission и REST-записи
сохраняются, `/health/ready` возвращает HTTP200 с `delivery: degraded`.
Docker health использует этот HTTP status; Traefik здесь использует file provider
со статическим upstream, а не Docker provider health. Core/Full setup отдельно
требует `delivery: ok`, актуальный init, measured resource policy и выделенный
volume; одного HTTP200 недостаточно для delivery acceptance.
Command client не держит offline queue и не повторяет неизвестный эффект;
следующая операция может выполнить новый ограниченный connect после outage.
Readiness владеет отдельным probe, shutdown сначала отменяет owned transports
и ждёт settlement; Streams readers закрываются до provider и auth/Mongo.
Обычная product runtime и финальная immutable acceptance остаются за Task 6.

Obsolete delivery generations очищаются ограниченными SCAN turns существующего
owner с physical fence на каждом delete batch. Удаление ограничено точными
conversations delivery keys; current/auth/unknown keys защищены. Canonical Mongo
retention остаётся 24 h. Три последовательных cold generations проверены отдельно.

Dedicated calibration завершилась: 4 PASS, 144 assertions, 1712.85 s.
Проверены fan-out 1/3 entries/s и conservative all-conversation 1/3 entries/s
за 24 h, заполнение и полный cold restore без OOM/timeout. Все выборки
независимого auth256 probe прошли. Максимальный conservative 3/s профиль:
259 200 entries, 446 009 085 encoded B, peak used_memory 538 676 688 B,
restored used_memory 538 676 544 B и RSS 558 624 768 B.
Это подтверждает выбранные профили, а не произвольный будущий traffic envelope.
Calibration загрузила source до последних review corrections; final exact-image
acceptance обязательна отдельно. Исходный shared256 FAIL не отменяется.
Подробные JSON measurements, source scope и ограничения —
`.superpowers/sdd/2026-10-20-ws-at-least-once/task-3-report.md` и соседние private logs.

Обычные `compose:backend`, `compose:up` и host-dev launcher не ждут health/init
брокера доставки: обязательными остаются auth/Mongo и выбранные приложения.
Delivery запускается отдельно detached; `delivery-broker-init` — наблюдаемый
Docker job с `restart: on-failure` и одной ограниченной bootstrap-попыткой
на процесс. При недоступности provider job повторяется; после его возвращения
инициализация завершается без перезапуска backend. Приложение не владеет
дополнительным bootstrap worker/timer.

После cold restart уже успешно завершившийся init (`exited 0`) автоматически
не повторяется. Fence остаётся fail-closed и health показывает delivery degraded
до явного повторного обычного launcher (например `bun run compose:backend`)
или существующего delivery init operation. Launcher пересоздаёт только init job;
это не автоматическое promotion/HA. Core/Full acceptance по-прежнему требует
актуальный successful init физического процесса и `delivery: ok`.
