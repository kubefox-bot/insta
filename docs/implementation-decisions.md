# Решения реализации Insta

Действующие решения приложения изложены по владельцам. Фактические проверки
и ограничения среды находятся в [testing.md](testing.md) и
[browser-compatibility.md](browser-compatibility.md).

## Владение и публичные контракты

SvelteKit владеет интерфейсом и BFF web sessions; Nest — авторизацией,
бизнес-правилами и canonical persistence. Между BFF и Nest сохраняется REST.
Backend HTTP DTO генерируют OpenAPI/Kubb. Generated SDK и server config не
входят в browser bundles. Framework entrypoints и generated exports не становятся
неиспользуемыми только из-за отсутствия буквального импорта.

Capability содержит domain, focused use cases, consumer-owned ports и adapters.
Composition создаёт клиентов, соединяет зависимости и управляет lifecycle.
Shared packages не импортируют consuming domains. Извлечение Conversations и
Stories проверяется public behavioral contracts и packed Kit builds; это не
независимое microfrontend deployment.

## Доставка сообщений

Mongo атомарно сохраняет message, sequence, idempotency identity, outbox и
компактный delivery journal. Publication success не означает обработку браузером.
Journal сохраняет возможность восстановить уже опубликованный хвост.
Основной replay находится в отдельном Dragonfly Streams с retention 24 часа.
Mongo остаётся последним источником восстановления Streams.

Auth и delivery используют отдельные clients, generation keys, volumes и budgets:
auth 256 MiB; delivery maxmemory 1 GiB при container limit 1536 MiB.
Сбой delivery не должен блокировать canonical REST login/history/send.
Возврат provider и повторный cold restart имеют отдельные readiness проверки;
сам факт работающего HTTP не доказывает готовность delivery.

Протокол первой версии использует prepare → canonical snapshot → exact activate
и retained logical cursor при reconnect. Только точный ACK `applied` после
применения текущим владельцем продвигает cursor. Повторы дедуплицируются;
потерянное последнее событие или ACK повторяется без следующего сообщения.
При недоступном retention клиент явно восстанавливает snapshot. Периодический
REST polling для восстановления realtime не используется.

Временные network/408/429/500/502/503/504 ошибки unread дают `retry-later`
с backoff/Retry-After, не продвигая cursor. Только пять явных permanent apply
failures блокируют конкретную подписку. До 64 последовательных unread
инвалидаций объединяются в один canonical read. Wire error codes имеют общий
owner и локализованные frontend mappings.

ACK связан с исходной командой через Socket.IO callback и transport generation;
subscription проверяет target, token и baseline. RequestId в ACK выдаёт серверный
observer для canonical tracing и не обязан совпадать с клиентским requestId.

Если Engine.IO transport временно не принимает запись, новая delivery attempt
не добавляется в его буфер. Повтор с backoff остаётся у delivery use case,
а cursor — на прежней позиции. SDK ACK timeout сам по себе не освобождает
очередь transport, поэтому проверка подтверждена тестом установленного SDK.

Retention использует монотонное время записи доставки, отдельно от business
timestamp. Очистка удаляет только истёкший prefix и сохраняет floor; Mongo TTL
не доказывает порядок. Источники для replay/analytics/projection защищены от
преждевременного удаления. Receipt cache ограничен retained history и отдельным
bounded буфером ранних receipts; eviction очищает связанные snapshots.

## Авторизация и состояние браузера

Текущий binding, owner и login generation проверяются сервером; actor snapshot
не предоставляет прав. Quota source использует native peer, известный proxy и
подписанный BFF assertion, а не произвольные forwarded headers. WS проверяет
свежий one-use ticket, Origin, membership и текущую сессию.

Frontend stores создаются на instance и не разделяют mutable user state между
SSR requests. UI использует текущего actor, включая смену сессии в другой
вкладке. Независимые SSR загрузки выполняются параллельно; session read разделяется
только внутри запроса. Первоначальная история — last 50; explicit after/before
paging сохраняет собственный контракт.

Offline queue привязана к owner/generation. Offline guard предшествует сетевой
reconciliation. Reauth сохраняет pending key/createdAt и требует подтверждения;
logout очищает собственную очередь. Поздние REST/WS результаты проходят
actor/subscription/epoch fences и не дублируют сообщение.

Continuation хранит ограниченную metadata в защищённом browser context без
текста сообщения или blobs. Только выбранный intent и текущий actor продолжают
действие. Close, navigation, смена actor/generation и dispose отменяют pending
create; поздний receipt освобождается своим владельцем. Ошибка cleanup старого
действия не инвалидирует новое. После входа требуется явное подтверждение,
без автоматической отправки. Приватная cleanup диагностика не отменяет logout
и не создаёт unhandled Promise.

## Media и сроки

Recorder создаёт WebM VP8/VP9 + Opus; backend сохраняет MP4 H.264/AAC upload,
validation, storage и playback. ISO MP4 и schema-aware EBML validators имеют
разные форматы и не являются дубликатами. Native decoder проверяет весь файл
без remux/transcoding. Лимиты: 15 секунд, 20 MiB, capture до 720p; остановка
recorder на 14800 ms оставляет место encoder tail.

Истечение Story, включая остаток меньше секунды, отличается от storage failure.
Playback сообщает фактический срок подписанного URL и повторно проверяет срок
после подписания. Objects приватны; Range/seek и signed host требуют отдельных
provider/browser проверок. Media fixtures читаются также через templates и
provenance records; отсутствие literal import не разрешает удаление.

## Ресурсы, privacy и диагностика

AbortSignal запрашивает отмену, но не доказывает завершение внешнего эффекта.
Slots, leases и borrowed clients освобождаются после actual settlement.
Shutdown прекращает новые claims, отменяет работу и ждёт HTTP, WS, workers и
SMTP до закрытия инфраструктуры. Watchdog 15 секунд сообщает failure;
неизвестные эффекты остаются recoverable. Camera tracks, listeners, timers,
subscriptions, object URLs и IndexedDB handles имеют явных владельцев.

Necessary privacy mode сохраняет приложение и минимальные operational logs.
Faro, optional browser metrics и analytics требуют текущего согласия.
Tokens, cookies, message text и signed URLs не включаются в diagnostics.
CSP не ослабляется ради fixtures: test script использует nonce текущей страницы,
а browser Zod boundaries обходятся без runtime eval. Telemetry intake проверяет
размер и quota до чтения body на своих точных method/path owners.

## Приёмка и локальная инфраструктура

Source checks, provider integration, abuse, UI/browser и физические camera/mic
проверки — разные виды доказательства. Последующий PASS не удаляет исходный
FAIL или неизвестную причину flake. Internal Docker HTTP/3 probe не доказывает
native browser QUIC либо опубликованный host UDP.

Приёмка использует точные FE/BE/testhost images из одного executable manifest,
пользователя bun и отсутствие source mounts. Существующие developer volumes и
чужие проекты сохраняются. Run-owned проекты ограничены scope и checkout labels;
очистка затрагивает только явно созданные этим запуском ресурсы.
Каждый browser test получает закрытый CONNECT egress к
localhost:443 → traefik:443 и собственный source address. Direct bypass допускает
numeric loopback fixture и точный выбранный HTTP redirect port. HTTPS не получает
общего localhost bypass. Optional telemetry восстанавливает defaults и
останавливает только собственный receiver, включая путь ошибки.
