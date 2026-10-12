# Архитектура основы Insta

Приложение — modular monolith с отдельными SvelteKit BFF/frontend и Nest backend.
Реализованы Users (auth/registration/directory), Conversations (включая сообщения),
auth continuation, Support reports, Privacy и Stories. Stories владеет публичным
feed/player, upload/publication, expiry и S3 storage adapters; media-recorder
владеет browser capture/preview и освобождением tracks/object URLs. Full runner
подключает media/storage сценарии; Core запускается отдельно с Stories disabled. Bun workspaces содержат технические shared packages fe-core и
portable contracts; отдельный DI container или business command bus отсутствует.

## Владельцы и зависимости

`apps/*/src/app` — техническая композиция: validated config, создание клиентов,
подключение портов, HTTP/WS handlers и lifecycle. Она не задаёт бизнес-решения.
Backend app разделён на composition/{runtime,providers,users,conversations,
support-reports,privacy,analytics,stories}, health/{http,readiness}, http, realtime,
workers и lifecycle. bootstrap.ts и module.ts остаются точками сборки; openapi.ts
экспортирует HTTP contract. Публичные index.ts содержат только именованные
реэкспорты. Readiness ограничен проверками готовности; RuntimeDependencies
сохраняет optional/offline composition. Users отдельно собирает Directory,
а Conversations получает явный findPublicUser port. Lifecycle owns остановку
HTTP, WS, analytics и mail workers до закрытия инфраструктуры.

Frontend app группирует Shell, Users, Conversations, continuation, Privacy,
Support reports, observability, infrastructure, HTTP, lifecycle и realtime.
Внешняя композиция использует отдельные browser/server index.ts. Session,
database, client-source, HTTP limits и telemetry intake имеют узкие публичные
subpaths: импорт одного lifecycle owner не включает чужие eager providers.
Console preload остаётся самостоятельным entry и собирается под прежним именем
dist/observability-preload.js. Shell собирает domain UI; auth-link policy и
очистка временного ввода принадлежат Users, selection/cancellation — continuation.
Shared Header и LocaleControls не зависят от app или domains.

Сценарий принадлежит capability: auth continuation разрешает выбранный intent
через собственный consumer-owned Conversations target port; Support owns создание
отчёта и email policy; Users owns auth/session authorization; Conversations owns
pair membership, history, message commit и outbox.

Domain rules и use cases не получают Mongo Db/ClientSession, HTTP clients, SMTP,
framework DI или environment. Адаптеры реализуют принадлежащие потребителю порты;
Nest DI остаётся в composition/transport. Transaction port выражает атомарный
commit сообщения/sequence/identity/events/outbox; Mongo sessions остаются внутри
адаптера. Ошибка provider, отсутствие объекта и forbidden различаются.

Между BFF и Nest сохраняется REST. Backend HTTP DTOs — источник OpenAPI/Kubb;
generated SDK и server config доступны только server owners. Web sessions и
encrypted bindings принадлежат BFF; canonical sessions, membership и persistence
принадлежат Nest. Caller actor snapshot не предоставляет прав: текущий binding,
owner/generation и native authorization проверяются ответственными владельцами.

## Публичные API и извлечение

Backend `domains/conversations/index.ts` предоставляет pure use cases и narrow
ports/types; `server/index.ts` предоставляет конкретные Mongo/WS adapters.
Frontend `domains/conversations/browser/index.ts` — UI/browser API;
`browser/state/index.ts` — отдельный headless API store/session/merge без UI,
host app, routes и server providers. `server/targets/index.ts` предоставляет
Conversations-owned target validation для continuation, не создавая HTTP providers.
Internal files импортируют реализацию напрямую; внешние consumers — public entries.

`__tests__/architecture/extraction.test.ts` копирует Conversations в отдельный
host, собирает только public entries и проверяет runtime import graph. Один
behavioral contract используется в исходном и извлечённом host: explicit ports,
self/missing/provider outcomes, isolated stores и поздняя subscription cleanup.
Извлечённые browser/server bundles упаковываются и устанавливаются в Kit fixture:
SSR production build разрешён, browser import `$app/server`-marked package
отклоняется. Сохранена исходная FND-02 packed fixture. Это доказательство
извлекаемости capability, без runtime federation или отдельного deployment.

Svelte stores создаются на capability instance; mutable user store не разделяется
между SSR requests. UI consumes readonly view и named operations. Styled/stateful
components содержат `index.svelte`, owner-local props/types/conts и CSS Module;
pure rules, ports, transport, persistence и rendering имеют отдельных владельцев.
Supporting operations остаются в local lib; общая библиотека появляется только
при двух совпадающих contracts. В DONE-03 переиспользован только matching test
command runner двух реальных packed fixtures; новый production shared layer не нужен.

## Server-first доставка и восстановление

Canonical messages, receipts, membership и unread принадлежат backend. Mongo
атомарно записывает business effect, outbox и компактный delivery journal;
публикация outbox не означает обработки UI. Выделенный Dragonfly Streams хранит
основной replay 24 часа; Mongo восстанавливает Streams, включая опубликованный
хвост без следующей публикации. Auth broker не используется как delivery fallback.

Первая версия протокола использует prepare → canonical snapshot → exact activate.
Retained logical cursor связан с owner/generation, transport subscription token
отдельный. Только точный applied ACK продвигает cursor; дедупликация делает повтор
безопасным. Временная unread ошибка даёт retry-later с backoff/Retry-After,
сохраняя позицию; пять явных permanent apply failures блокируют одну подписку.
При retention gap требуется snapshot. Периодического REST polling нет.

ACK связан с исходной командой через Socket.IO callback и transport generation;
subscription проверяет target, token и baseline. RequestId в ACK выдаёт серверный
observer для canonical tracing и не обязан совпадать с клиентским requestId.

Если Engine.IO transport временно не принимает запись, новая delivery attempt
не добавляется в его буфер. Повтор с backoff остаётся у delivery use case,
а cursor — на прежней позиции. SDK ACK timeout сам по себе не освобождает
очередь transport, поэтому проверка подтверждена тестом установленного SDK.

Delivery retention упорядочен по монотонной записи, не по business timestamp.
Очистка сохраняет floor и удаляет только истёкший prefix. До 64 последовательных
unread invalidations объединяются в один canonical BFF read. Receipt snapshots
очищаются при history eviction, ранние receipts имеют отдельный bounded буфер.

SSR loaders разделяют один ленивый session read только внутри запроса;
независимые branches запускаются параллельно. Frontend Shell использует текущий
auth view, а continuation проверяет selection и actor/generation до и после
асинхронного create, освобождая поздний receipt после close/navigation/dispose.

## Lifecycle и неизвестные эффекты

Nest module destroy начинает HTTP stop/drain одновременно с WS/analytics stop.
Новые outbox waves не приобретаются после shutdown; signal запрашивает отмену
current publication. Slot/lease ownership сохраняется до actual sink settlement,
затем pending retry сохраняется. Gateway closes sockets/listeners и ждёт commands
и session watchers; инфраструктура закрывается после drained HTTP и workers.
SMTP transport ждёт owned sends, отказывает новым отправкам после close и
закрывается обоими worker owners. Уже принятый SMTP нельзя «отправить назад».

Bun adapter frontend останавливает HTTP и сообщает drained event. С первого
SIGTERM/SIGINT BFF отменяет startup acquisition, прекращает новые revocation
attempts между bindings и ждёт текущую операцию; только после drain закрывает
Dragonfly/Mongo, затем OTel/Pino. Каждый close memoized у composition owner.
15-секундный watchdog завершает процесс с failure при исчерпании budget; это
не successful Promise.race и не доказательство отмены внешнего эффекта.

Frontend disposal снимает outbox/realtime listeners, timers и subscriptions,
отменяет owned requests и очищает view. Поздняя history/subscription completion
проходит epoch/actor fences и освобождает приобретённую подписку. IndexedDB
pending records сохраняются при dispose/reauth; explicit logout имеет свой
отдельный clear contract. Camera streams/object URLs отсутствуют в core.

## Проверка границ

FND-02 scanner покрывает standard JS/TS Svelte instance/module/legacy scripts,
aliases, relative imports, cycles, public subpaths, env ownership и server/browser
negative fixtures. Props/interfaces/type purity также проверяются. Arbitrary
preprocessors, markup expressions и conditional/wildcard exports требуют ручного
review. Для изменённых owners отдельно читаются dependency direction, state
transitions, transaction/resource ownership, literals и поддерживающие операции.
Глобальная перепись унаследованного tooling не выполнялась.

Источник актуальной проверки — [testing.md](testing.md), ограничений среды —
[runtime compatibility](runtime-compatibility.md), решений —
[implementation decisions](implementation-decisions.md). Финальный независимый
review всей ветки выполняется отдельным gate после DONE-03; этот документ его не заменяет.

### Live-обновление Stories

Авторизованный account host подписывается на общий публичный поток `stories:public` в том же WS-соединении. Команды `stories.feed.subscribe` / `stories.feed.unsubscribe` и событие `stories.feed.changed` используют существующие prepare, snapshot, activate, cursor и ACK. Публикация атомарно сохраняет Story, её outbox, notification source manifest и ссылку delivery journal. После инвалидации серверного feed cache outbox материализует уведомление в выделенный Dragonfly Streams. Завершение Stories outbox и notification source также атомарно; pending source не удаляется очисткой. Общий retention берётся из validated realtime configuration (по умолчанию 24 часа).

Browser перечитывает canonical feed по событию, подтверждает только успешно применённое чтение и повторно подтверждает дубликаты. Временный отказ оставляет cursor на месте и возвращает retry-later. Reconnect использует retained cursor; retention gap требует нового snapshot. Периодического REST polling нет: отдельный таймер существует только для повтора неудачного bootstrap и снимается при потере поколения/dispose. Гостевая лента сохраняет обновление при открытии/возвращении во вкладку; публичная анонимная WS-подписка не добавлялась. Общий клиентский subscription lifecycle перенесён в `lib/realtime/subscription`; Stories не импортирует private implementation Conversations.
