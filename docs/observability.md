# Наблюдаемость FND-05

Logging-only accessor BFF проверяет LOG_LEVEL независимо от обязательных
DB/API secrets; validation приватной конфигурации сохранена.

Серверы `be-insta` и `fe-insta` пишут operational JSON в stdout через Pino 10.4.0.
Nest 12.1.2 подключает nestjs-pino 5.3.1; automatic access logging pino-http
выключен. Отдельный Node runtime ради логгера не нужен: native HTTP, scope,
ошибки и shutdown проверяются под Bun 1.4.2.

## Схема и безопасность

Обязательные поля: `schema_version: 2`, `app: insta`, `service_name`,
`source: server`, `event_type`, строковый `level`. Pino добавляет ISO `time`.
`request_id` — проверенный UUID; `operation_id` — UUIDv4. `trace_id`/`span_id`
server adapter берёт только из настоящего активного OTel span; переданные в log
object trace IDs не являются авторитетными. При отсутствии context ID не
создаётся. Корреляция не означает actor, права или владение эффектом.

`http_request` содержит `http.method`, route template, `status_code`,
`duration_ms`. Nest пишет один event по `finish`/`close` и снимает оба listener;
оборванный ответ имеет status 499. BFF пишет один event после создания Response
в `handle`, включая отказ limits/ошибку. Его duration измеряет обработку до
Response, не завершение передачи streaming body клиенту.

`business_operation` содержит operation, outcome, authority, code, retryable и
result_unknown; существующие HTTP/business consumers сохраняют duration в
`http.duration_ms`. Для WS terminal events whitelist дополнительно принимает
`business.duration_ms` (конечное неотрицательное число); WS не создаёт `http`. Каталоги операций,
целей и canonical commit принадлежат владельцам сценариев. Generic
пакет не знает auth/chat/story. Symbolic metadata задаётся кодом приложения,
не текстом пользователя. Identity задаётся composition и не подменяется записью.

Whitelist применяется перед каждым portable sink и каждым Pino method, включая
Nest logger. Произвольные attributes, req/res, headers, body, raw URL/query,
интерполяция и пользовательские message не проходят в JSON. Exception — только
`{type: Error, message: Error details omitted, truncated: true}`; raw name,
message, stack, cause и вложенные пользовательские поля исключены. Pino redact
остаётся дополнительным барьером. Child bindings также исключены. Kit
`handleError` заменяет default raw console output безопасным exception event.
Метаданные нельзя использовать как канал для контента/секретов.

## Публичные границы

`@insta/fe-core/observability/browser` предоставляет portable Operation,
createObservabilityService, createBusinessObserver и meter adapter без async_hooks,
Pino, Nest или Kit. `business`, `otel`, `contracts` — узкие дополнительные
subpaths. `server` предоставляет ALS, Pino, HTTP completion и real OTel scopes.

Server subpath выбирает пустой `browser/server-unavailable.ts` в browser condition;
named server import в настоящем packed Kit/Vite build падает с MISSING_EXPORT.
Namespace/side-effect import пустого browser module не является универсальной
ошибкой сборки и не предоставляет server API. `browser: null` оказался
недостаточным: проверенный Vite 8 fallback выбирал default export.

Статический scanner не получил поддержку произвольных conditional exports.
Root tsconfig явно связывает этот exact public server subpath с owner entrypoint,
а BFF API policy защищает exact package specifier и reexports для TS/Svelte.
Существующие private-import, aliases, cycles и browser/server gates сохранены.
Kit marker находится только в app-owned server bridge. SSR enrollment включает
portable fe-core APIs/providers/Pino; stateful server public subpath externalized
только в SSR rolldown build, чтобы Kit и Bun preload загружали один ALS owner.
Vite automatic externalization не принимает TS package entrypoint; Bun runtime
поддерживает его напрямую. OTel API остаётся singleton runtime dependency BFF.
Packed SSR, native Bun, portable browser build и negative client build проверяются
отдельно. Это не доказательство любых package export conditions или preprocessors.

## Контекст, согласие и lifecycle

`withContext({context, execute})` использует ALS.run и возвращает исходное значение
execute. Хранятся только requestId/operationId, из копии разрешённых полей.
Вложенный scope восстанавливает outer context. WS команда/worker attempt должны
вызывать новый scope и явно владеть detached callback; scope на весь сокет не нужен.
Actor, зависимости и транзакция остаются явными аргументами сценария.

BFF передаёт проверенные request/operation headers через API port; Nest reuse
нормализованного request ID обеспечивает одинаковый ID в envelope, header и log.
Inbound headers не мутируются: transport accessor использует active technical scope
и shared validator, сохраняя исходный header budget N/N+1. Вне owned scope
стабильный ID задаёт caller через validated attempt header/withContext; скрытого
global request/actor cache нет.
OTel ContextManager владеет span context; W3C propagator проверяет traceparent.
Перед каждым span creation проверяется injected current permission port.
Default denied и ошибка permission port не создают span и не усваивают входной
trace. До PRIV-01 обе production композиции используют default denied: необходимы
технические ID и минимальные operational logs, но подробные spans выключены.
Unit allowed fixtures отдельно доказывают реальный SDK span и parent propagation.
Receiver/env flag сам по себе не даёт разрешение.

Экспорт traces/metrics/Faro, Collector, client analytics и goals не включены.
Span processors/exporters отсутствуют; наличие SDK не означает delivery. Метрики
имеют catalog-bounded operation/code и конечный outcome; без catalog имена
нормализуются в unknown. source operation counter включает attempted и terminal:
сумма всех series не равна числу успешных операций. Pending не записывает duration в histogram.

Сбои синхронных/асинхронных record/diagnostic sinks не меняют business Result или
идентичность thrown error. emit boolean отражает синхронный handoff, не delivery
асинхронного sink. Для export failure здесь проверен rejected sink; реальный
сетевой exporter/receiver отсутствует и не объявляется проверенным.

Pino flush ограничен 1000 ms и идемпотентен; возможны flushed/failed/timeout.
Stdout и injected destination заимствованы, adapter не закрывает чужой stream.
OTel provider закрывается; process context manager имеет owned leases и
освобождается после последнего root. Nest связывает lifecycle с app.close/SIGTERM,
Bun Kit с sveltekit:shutdown после drain. Для Nest поддерживается одна logger
композиция на production process, как в nestjs-pino; несколько независимых Nest
root loggers внутри одного process не являются проверенным deployment mode.
Application containers используют json-file rotation: 10m, три файла.
Production BFF entrypoint запускается с app-owned Bun preload. Он заменяет
только console.log/info/debug/warn/error/trace в своём процессе: arbitrary args
вообще не читаются, system event идёт через Pino, original refs восстанавливаются
при exit. Это закрывает native adapter banner и console.error до/вне handleError.
Bridge не активируется импортом portable API, не трогает родительский test process
и не перехватывает прямой process.stderr.write или native engine diagnostics.
Dev-tool/Vite console и другие console methods не объявляются универсально
защищёнными; app source их не использует. Functional stdout probe reports и
offline OpenAPI exporter сохраняют собственный JSON протокол.

## Перенос и проверки

Read-only источник: DC/fe-core commit
`25179cab2353ff2199557dd1bc2134811d3d3180`, package observability.
Перенесены Operation, business observer/completion/confirmed effect/diagnostic
isolation и business metric mechanisms; fixtures business-operation,
confirmed-effect и otel-metrics сохранены под `__tests__/observability/upstream`.
Diagnostic isolation адаптирован с bounded promise barrier вместо sleep.
Request IDs ужесточены до принятого UUID HTTP контракта; request-1 fixture заменён
UUID. Pending логируется как info; в upstream общий fallback давал error.
Raw attributes/error capture исходника не переносится в log records.
Default metric catalog fail closed; upstream metric fixture задаёт свой explicit
catalog. HTTP response builders, React/Next/Faro adapters и доменные catalogs не
перенесены. API envelope проекта не менялся.

Focused tests: `bun test ./packages/fe-core/__tests__/observability
./__tests__/observability --timeout 120000`. Native backend fixture запускается
с app tsconfig, чтобы применять необходимые legacy Nest decorators.
`bun run check` проверяет root/tooling/contracts/native app/build/compatibility.
Docker production shutdown/context — отдельный
`__tests__/integration/observability.host.test.ts`, только run-owned oneoffs.
Abuse и product Playwright E2E эта foundation задача не реализует.

## Core canonical analytics (DONE-01)

Users/auth, conversations и support-reports сохраняют canonical запись вместе
с подтверждённым эффектом Mongo. Регистрация получает goal только после active
user + session, conversation — только при CREATED, сообщение — после persisted
message, support — после saved report. Logout pending и повторный revoked не
создают новый goal. Attempt/event/terminal операционные записи не являются
конверсиями. `analyticsEventId` принадлежит эффекту, отдельно от `operationId`;
несколько эффектов одной операции имеют разные ID. Replay читает существующую
запись, включая ID. Request ID принадлежит новой попытке.

Без consent reference native/business операция выполняется нормально. BFF
передаёт только proof из расшифрованной HttpOnly cookie, Nest проверяет его через
Privacy. Reference является технической метаинформацией; DTO тела, actor и права
доступа не меняются. Adapter фиксирует исходную eligibility до транзакции.
Optional worker вновь вызывает `allowAnalytics` перед каждым dispatch. Missing,
necessary, expired, generation/policy/revision mismatch дают отказ; новый all не
создаёт projection для прошлого эффекта и не возвращает denied delivery в очередь.

Состояния `log_only` и `otel` независимы. Canonical outbox и lease Mongo являются
учётом server conversions; browser claims ограничены 24 часами/256 записями и
обеспечивают лишь best effort deduplication. Crash после stdout и до completion
может повторить строку с тем же `analyticsEventId`. Sink/permission/metadata outage
не меняет persisted business outcome; projection остаётся pending или отсутствует.
Deadline запрашивает abort, но слот сохраняется до фактического окончания I/O и
cleanup; `Promise.race` не освобождает claim. Log-only пишет только утверждённую
projection, без текста сообщения/отчёта, proof, email, паролей, headers и raw errors.
Идентификаторы не становятся metric labels.

BFF `/api/telemetry` принудительно устанавливает `client_observed`; whitelist
операций/code не принимает server-only conversion. Arbitrary text/goal/authority
и request/trace/email поля от клиента не проходят в projection. JSON ограничен
16 KiB, batch — 20 events, общая квота обоих intake routes — 60 запросов за минуту
на серверно определённый source. Intake имеет собственный request ID. Public
marketing DTO не содержит technical correlation или пользовательский контент.

Faro 2.12.1 загружается динамически только после current all и успешного
same-origin BFF probe реального Faro JSON receiver. SDK instrumentations выключены:
их Errors/WebVitals реализации не предоставляют destroy. Наши error/rejection
listeners и PerformanceObserver имеют владельца и снимаются при stop. Raw error
не читается: SDK получает фиксированный error, sanitizer до export удаляет
URL/query/headers/cause/stack и метаданные пользователя/страницы. Transport владеет
AbortController, response stream и pending promises; stop отменяет запросы и ждёт
cleanup. Necessary режим сохраняет обычные UI error handlers. Receiver отсутствует
по умолчанию; SDK capture/export в этом состоянии выключены. Request tracing
foundation по умолчанию также остаётся без exporter.

### Optional local receiver

Профиль Compose `telemetry` содержит локальный Bun receipt receiver, без Grafana,
Яндекса и внешних endpoint. После отдельного включения профиля можно задать
`FARO_RECEIVER_URL=http://telemetry-receiver:4318/collect` для BFF и
`OTEL_RECEIVER_URL=http://telemetry-receiver:4318/v1/traces` для Nest. Пустые значения
оставляют exporters выключенными; конфигурация отвергает внешние hosts, credentials,
query/hash и неверный protocol path. Receipts доступны внутри локальной сети на
`/receipts`, содержат только protocol/count, bounded in-memory 256 records.
`OPTIONS /collect` подтверждает `faro-json-v1`; Faro body не принимается на
`/v1/traces`. OTLP JSON profile экспортирует разрешённые canonical effect spans,
а не полные HTTP payload или историю необходимого режима. HTTP trace propagation
ALS/OTel foundation не заменяется отдельным tracing context manager.

Для расследования сначала найдите operational `request_id` попытки, затем
`operation_id` бизнес-операции и canonical `analyticsEventId`. В Mongo проверьте
сохранённый effect и оба delivery states; stdout handoff и SDK initialization сами
по себе не доказывают receiver receipt. Проверки unit, real Mongo/Dragonfly,
изолированного abuse, browser SDK и packaged runtime учитываются отдельно в
DONE-01 report. Полная core acceptance matrix принадлежит DONE-02. Stories
добавляет атомарный `story.publish` → `story_published` через существующий worker
и `story.play` → `story_play_started` с authority `client_observed`. Клиентский
intake проверяет current consent и дедуплицирует analyticsEventId; goal выводится
из Stories catalog через доверенный composition callback после generic Pino whitelist;
произвольный browser goal/authority отбрасывается, включая допустимый по формату goal.
Внутренний canonical operationId принимает bounded safe correlation до128 символов
с сохранением UUID; analyticsEventId и внешние HTTP/header validators не меняются.
Metadata/prefetch, hidden/paused/waiting video и necessary mode не создают goal.
Фактические фазы и аппаратные ограничения описаны в [документации тестирования](testing.md) и [совместимости браузеров](browser-compatibility.md).

## Terminal WS command logs

На каждую допущенную к исполнению WS command попытку observer пишет один
`business_operation`: `operation`, `outcome`, `code`, `authority: server_canonical`
и `business.duration_ms`. Conversations adapter выбирает bounded operation из
проверенного command schema; неизвестный input получает `ws.unsupported`.
ACK success → `OK/succeeded`; validation, forbidden, revoked, unsupported и
rate limit → `rejected`; internal/dependency error → `failed`. Необработанное
исключение → `WS_COMMAND_FAILED/failed`, без error message или stack.

Свежий requestId, проверенный operationId и ALS/OTel scope сохраняются до
terminal log; завершение освобождает scope. Payload, conversation ID, ticket
и сообщение ошибки не включаются. Сбой logger не меняет результат или
исключение команды. Часы по умолчанию monotonic `performance.now`; тесты
используют deterministic clock и настоящий Pino whitelist/destination.
Это structured stdout для Docker; exporter/Grafana delivery не проверялись.
Существующий OTel business-metrics adapter читает legacy `http.duration_ms`;
WS duration в его histogram в этой задаче не подключена.
