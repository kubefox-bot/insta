# Локальный runbook

## Выбор режима и независимое обновление

Host: `mise run infra:up`, затем `mise run dev` либо отдельные
`dev:backend` / `dev:frontend`. Контейнеры: `compose:up` либо
`compose:backend` / `compose:frontend`. Всегда сохраняй один
COMPOSE_PROJECT_NAME и port selection для команд одного стенда. Не смешивай
mode/checkout в одном project. Проверка occupied port отказывает до подготовки;
borrowed service не останавливается. Ctrl-C host apps не останавливает Docker.

Для update только app в container mode используй соответствующую mise command;
она пересобирает target и сохраняет другой app. `compose:down` останавливает
свой project без удаления volumes. Настройки и ограничения DNS/custom-port
redirect: [local-infrastructure.md](local-infrastructure.md).


Стенд работает через `compose.yaml`, Docker Unix socket и project `insta-core`.
Начальная подготовка и safe stop описаны в [README](../README.md) и
[local infrastructure](local-infrastructure.md). Существующие `.env`, certificate,
Mongo/Dragonfly/Mailpit volumes сохраняются. Production domain/ACME, system CA
trust, backup service и автоматический production restore здесь не настроены.

## Swagger UI и native REST

Swagger UI доступен на [https://localhost/docs](https://localhost/docs), JSON —
на [https://localhost/docs/openapi.json](https://localhost/docs/openapi.json).
Nest собирает документацию из текущих HTTP DTO и декораторов тем же builder,
который использует `contracts:check`. Runtime document добавляет только сервер
`/docs/api`; канонический `packages/contracts/openapi.json` и generated SDK
сохраняют native пути `/health/...` и `/v1/...`.

Открой `GET /health/live`, выбери **Try it out** и **Execute**: запрос идёт на
`/docs/api/health/live`. Traefik удаляет `/docs/api` и направляет его в Nest.
Для защищённых операций введи native access JWT в **Authorize**; поле Bearer
добавляет `Authorization: Bearer ...`. Browser web-session cookie для этого
API недостаточно. JWT действует только в текущем открытом UI и не сохраняется
после перезагрузки; внешний validator отключён.

Без JWT `GET /v1/me` возвращает 401 `ACCESS_TOKEN_INVALID`; с истёкшим или
отозванным JWT действует обычная native auth-политика. Через этот путь сохраняются
readiness, rate/payload limits и бизнес-авторизация. Отдельные HTML/JSON/ассеты
документации читаются при недоступных зависимостях; лимит заголовков сохраняется,
а `/docs/api` и похожие пути не получают это исключение. Поэтому доступная
документация сама по себе не доказывает готовность backend.

```sh
curl --cacert infra/certs/localhost.crt https://localhost/docs/openapi.json
curl --cacert infra/certs/localhost.crt https://localhost/docs/api/health/live
curl --cacert infra/certs/localhost.crt https://localhost/docs/api/v1/me
```

Последний запрос должен вернуть 401. Не копируй JWT или ответы с credentials
в Git, screenshots и общие диагностические артефакты.

## Mongo: данные и индексы

Mongo 8.0.15 использует replica set `rs0`. `insta_api` получает readWrite только
`insta_api`; `insta_web` — только `insta_web`. Доменные адаптеры owns schema/indexes;
другая capability не читает private collections. Транзакции используют snapshot
read concern и majority writes. DB credentials находятся только в private config.

| Владелец | Коллекции | Основные ограничения |
| --- | --- | --- |
| Users | users, users_registration_proofs | unique emailKey, partial unique usernameKey, unique tokenDigest/userId proofs; pending registration cleanup по deadline |
| Native auth | users_sessions, users_auth_replays, users_outbox | unique backendSessionId; owner/operation/keyDigest replay identity, expiresAt TTL; operation_unique canonical auth effect |
| Conversations | conversations, conversations_messages | unique pairKey; participant/activity index; unique conversationId+sequence |
| Messages | conversations_identities, conversations_events, conversations_outbox | actor+keyDigest identity; separate eventId/analyticsEventId; partial unique conversation_created; per-sink pending/nextAttempt/lease indexes |
| Support reports | support_reports, support_replays, support_outbox | mail state/nextAttempt/lease index; replay expiresAt; owner cleanup после 30 дней |
| BFF sessions | bff_sessions в insta_web | unique bindingId, cleanupAt TTL и pending revocation.nextAttemptAt index |

Sequences и idempotency identity фиксируются атомарно с message/events/outbox.
При unknown commit не удалять message identity, pending job или lease вручную:
сначала повторить owning operation с прежним key и проверить canonical result.
WS outbox имеет lease30s, attempt10s, bounded wave20/concurrency4; shutdown
немедленно сигнализирует current wave и не начинает новую. Retry сохраняет
event identity. После crash истёкшая lease допускает повторный claim; отдельные
sinks не разделяют состояние доставки. Повтор stdout/realtime возможен; consumers
deduplicate по stable identity. Опциональная projection не является частью business commit.

## Dragonfly restart/restore

Standalone master Dragonfly 1.34.2 использует process identity `master_replid` и
atomic Lua generation fence. Обычный restart приложения сохраняет live generation.
Cold restart/restore broker оставляет старую snapshot generation невалидной;
readiness/admission закрыты до bootstrap. Приложение не ротирует generation само.
После согласованного restart broker порядок такой:

```sh
docker compose --project-name insta-core run --rm broker-init
docker compose --project-name insta-core restart be-insta fe-insta
```

Временные OTP/tickets/intents/consent прежнего поколения не принимаются. Streams
не считаются lossless после snapshot; durable Support/Messages pending state
восстанавливается из Mongo. Cold restore tests используют отдельный owned volume,
не пересоздают developer volume. Hot restore/promotion/replication не поддержаны.

## Web sessions и pending revoke

Access действует 15 минут; refresh expiry — min(now+7 дней, absolute30 дней).
BFF сохраняет encrypted credentials/revoke secret; browser cookie содержит
protected binding context. Recovery unknown refresh ограничен startedAt+2 минуты,
не продлевается обычным API/refresh/logout и не выдаёт новую cookie из обычного запроса.
После cutoff binding блокирует BFF-доступ; persisted retry отзыва начинается при logout. Logout немедленно
блокирует локальное владение даже при native outage; подтверждение revocation
остаётся отдельным persisted outcome.

Не удалять blocked binding с pending revoke, не менять stable key и не объявлять
unknown revoke подтверждённым. Worker повторяет тот же ключ после restart; при
graceful stop ждёт текущий bounded backend call и не начинает следующую запись.
Поздняя refresh completion проверяет revision/lease/generation и не оживляет logout.
IndexedDB queue после нового входа или 24 часов требует явного подтверждения;
dispose/reauth не означает удаление очереди, explicit logout имеет отдельный clear.

## Ключи, backup и rotation

`AUTH_SIGNING_KEY` выводит отдельно purpose-scoped replay/limit keys;
`SESSION_ENCRYPTION_KEY` через HKDF выводит cookie/credentials/revoke/privacy keys.
`BFF_SOURCE_SIGNING_KEY` — отдельный shared BFF/Nest HMAC secret для trusted source,
не auth token. Config validates64hex и не логирует значения. Здесь нет keyring,
dual-key decryption или live rotation API: замена root key не является безопасной
миграцией encrypted bindings/replays и может сделать pending recovery невозможным.

Для будущей согласованной offline rotation: остановить новые операции, дождаться
settlement; сделать защищённые согласованные backups Mongo, broker snapshot и
старой конфигурации; проверить восстановление в отдельном isolated стенде;
разрешить pending refresh/revoke/mail прежними ключами либо подготовить явную
owner-specific decrypt/re-encrypt migration и dual-key переход; затем заменить
конфигурацию, перезапустить точные сервисы, проверить generation/readiness,
authenticated acceptance и recovery. При нерешённом pending outcome остановить
rotation до изменения ключей. Этот порядок — операторский план, не выполненная
backup/rotation и не разрешение на смену access/secrets. Фактические keys/accounts
в документацию и Git не копировать; старые ключи хранить только в approved protected backup.

## Support, Privacy и observability

Support owner хранит report/replay/canonical email state30 дней и удаляет
истёкшие записи/связанные owned outbox в cleanup transaction. Mailpit — локальный
SMTP destination. После принятого SMTP и потерянного подтверждения возможна
повторная доставка с тем же message ID; exactly-once SMTP не обещается.

Necessary/default preferences сохраняют всю функциональность и minimal server
operational logs. Optional Faro/metrics/goals требуют current all и актуальную
revision/generation; receivers настраиваются отдельно. Отсутствие receiver означает
disabled export, SDK initialization не доказывает receipt. Logs schema_version2
исключают секреты и message text. Diagnostic artifacts защищаются отдельно.

## Stories storage и восстановление

Обычные `compose:up` и host-dev запускают Stories с валидированным private profile;
RustFS и приватный bucket готовы до запуска backend. Явный `STORIES_MODE=disabled`
оставляет Core без Stories. Full acceptance использует собственный immutable image
profile, описанный в [testing.md](testing.md). RustFS сохраняет данные в named
volume `insta-core_stories-storage`; credentials хранятся в приватном `.env`.
Старый storage profile сохраняют, пока его объекты и ownership не reconciled;
переключение default не переписывает ссылки опубликованных объектов.

Два физических upload/provider слота удерживаются до фактического settlement,
включая отменённые запросы; перегрузка возвращает 503 BUSY и Retry-After. Это
отдельно от лимита пяти активных историй автора и двух native decoder процессов.
Unknown PUT сохраняет operation/profile/key для cleanup и recovery; нельзя
освобождать учёт лишь по timeout или удалять volume ради green. Playback URL
короткоживущий, Range обслуживает storage; URL, токены и медиабайты не логируются.
Publication и canonical outbox записываются атомарно; optional projection требует
исходного consent. Клиентский goal возникает только при активном видимом playing
с текущим explicit all. Metadata/prefetch и necessary mode goal не создают.

При SIGTERM/SIGINT HTTP прекращает admission, WS закрывает sockets, workers
прекращают new claims, owned operations реально settle до закрытия клиентов,
OTel/Pino завершаются последними. Budget15s исчерпан — process failure и unknown
pending effects, а не successful cancellation. `infra:down` сохраняет volumes.
Не использовать `down -v`, reset/prune/drop developer databases для recovery.

## Обновление runtime для UI acceptance

На уже подготовленном локальном стенде собирай образы последовательно, затем
пересоздавай только приложения. Существующие project, config, certificates,
trust и volumes сохраняются; предупреждение об orphan containers не разрешает
их удаление.

```sh
docker compose --project-name insta-core build be-insta
docker compose --project-name insta-core build fe-insta
docker compose --project-name insta-core build testhost
docker compose --project-name insta-core up -d --no-deps --force-recreate --wait be-insta fe-insta
docker image inspect insta-core-be-insta insta-core-fe-insta insta-core-testhost --format '{{.Id}}'
```

Сначала запиши source tree и реальные sha256. Runner не имеет `--help` и требует
все три image flags. Он не делает implicit build/up:

```sh
bun run test:integration -- __tests__/integration/messages.test.ts \
  --scope=core --retry=0 --testhost-image=sha256:TESTHOST_DIGEST \
  --fe-image=sha256:FE_DIGEST --be-image=sha256:BE_DIGEST
bun run test:e2e -- __tests__/e2e/ui/acceptance.spec.ts \
  --scope=core --retry=0 --testhost-image=sha256:TESTHOST_DIGEST \
  --fe-image=sha256:FE_DIGEST --be-image=sha256:BE_DIGEST
AUTH05_TESTHOST_IMAGE=sha256:TESTHOST_DIGEST \
  CHAT03_TESTHOST_IMAGE=sha256:TESTHOST_DIGEST \
  bun node_modules/@playwright/test/cli.js test \
  --config __tests__/e2e/playwright.config.ts \
  __tests__/abuse/conversations/browser-queue.spec.ts
```

Подставь digests из inspect. Queue spec запускается прямым Playwright:
provider `test:abuse` обнаруживает только `.test.ts`, а E2E runner принимает
только discovered `__tests__/e2e/` paths. Отсутствующий discovery.spec не является
selector; discovery покрывают существующие layout/final-core/review-sync.
Artifacts содержат только synthetic UI, директории0700/files0600. Captures
viewport-only с repaint barrier; отдельный bottom frame сохраняет обычную
прокрутку. FullPage image не использовать как visual proof. Ручной Browser
fixture живёт до конца проверки и затем очищает только свои accounts/keys/mail.
Порядок UI-проверок и их ограничения описаны в [документации тестирования](testing.md).
