# Проверка Insta и Stories

Обязательная приёмка `core` включает A01–A16, A21–A28 и E01–E09, E12–E14. Scope `full` дополнительно включает все 14 Stories/media частей, включая native recorder, RustFS, late PUT, Range/seek и storage profile. В самостоятельном `core` эти части остаются исключёнными. Карта частей и единственных первичных владельцев находится в [scenarios/conts.ts](../scripts/testing/scenarios/conts.ts) и [scenarios/owners.ts](../scripts/testing/scenarios/owners.ts). Несколько уровней доказательства одного сценария используют существующие тесты; вторые suites не создаются.

`bun run check` проверяет tooling, границы, типы, contracts/unit, сборки и foundation compatibility. Этот результат сам по себе не доказывает интеграции, abuse или продуктовые браузерные пути.

Полный runner запускается после подготовки ROOT: актуальные immutable Linux arm64 образы, их source parity, готовые Mongo/Dragonfly/Mailpit/Traefik и приложение. Образы работают от `bun`, без source/dependency mounts: testhost в `/workspace`, приложения в `/workspace/apps/be-insta` и `/workspace/apps/fe-insta`. Дополнительная установка сервисов и пересборка не входят в runner. Тег `insta-core-testhost`, который используют существующие core fixtures, должен указывать на тот же точный digest.

```sh
bun run check:full --scope=core \
  --testhost-image=sha256:TESTHOST_DIGEST \
  --fe-image=sha256:FE_DIGEST \
  --be-image=sha256:BE_DIGEST \
  --telemetry-profile=.infra/done02-telemetry-compose.json \
  --default-profile=.infra/done02-default-compose.json
```

Здесь нужны настоящие 64-символьные SHA-256, а не значения из примера. Runner использует локальный endpoint из `DOCKER_HOST` или выбранного Docker CLI context (Unix socket либо Windows named pipe); удалённые TCP/SSH endpoints отклоняются. Стандартные Compose projects — `insta-core` и `insta-stories`. Для изолированной приёмки разрешён явно выбранный `insta-acceptance-{core|full}-<12 hex>` только совпадающего scope; checkout, labels, exact image и mounts проверяются до фаз. Runner проверяет identity/readiness и запрещает source mounts до тестов. Отсутствующая инфраструктура означает failed setup и `not-run` обязательных фаз.

Порядок фаз: tooling/app type/build → contracts/unit → реальные provider integration → host integration → provider abuse → host/browser abuse → основной Playwright Chrome/Edge → E02/E05 smoke → отдельный HTTP/3 protocol probe → optional receiver setup → main Faro → восстановление default → остановка точного owned receiver. Обязательная telemetry-часть E12 без явно переданных профилей остаётся `not-run`. Профили проверяются на точные image IDs и локальные URLs. Живой чужой receiver не заменяется; run-owned label проверяется перед остановкой, контейнер сохраняется, volumes не удаляются. Восстановление default выполняется в `finally` даже после падения теста; его ошибка остаётся отдельной фазой.

`test:integration`, `test:abuse`, `test:e2e` принимают те же image arguments и конкретные пути тестов. Неизвестный путь и пустой selector вызывают отказ; ноль совпадений Playwright не считается успехом. `--scope=full` проверяет наличие всех обязательных Stories/media owners и enabled prepared profile; core не запускает их инфраструктуру. `--stories-profile` допустим только с `--scope=full`.
Core setup требует disabled режима actual FE/BE и effective testhost configuration
(prepared image environment с override из явно выбранного `compose.yaml`);
отсутствующий mode сохраняет typed default disabled, enabled/invalid отклоняются
до фаз. Run-owned проект не даёт права очищать существующие developer volumes.

Отчёт: `.infra/acceptance/<testRunId>/report.json`. Каталог имеет mode `0700`, файлы — `0600`; trace/video/screenshots выключены. Артефакты не публикуются. Поля содержат scope, setup, версии, run ID/seed, scenario ID/part, required/deferredReason, fault point, ожидаемый и фактический результат, attempts и evidence. UUID служит идентификатором прогона; workload состоит из фиксированных causal cases, без fuzz/flood. Синтетические fixture IDs создаются отдельно.

Каждая фаза сохраняет exit code и приватные логи. Первичные Chrome/Edge suites выполняются отдельной командой на каждый enrolled файл; четыре capacity-профиля также имеют отдельные команды. Лимит каждой команды остаётся 15 минут, ни один owner не заменяется фильтрованным smoke. После ошибки следующие безопасные фазы продолжаются. `--retry=1` сохраняет исходный fail и ставит `flake`; passing retry не даёт безусловного acceptance. Если команда владельца упала, отчёт не выводит индивидуальные passing tests из факта запуска файла. Часть считается пройденной только после успешного выполнения всех назначенных owner paths.

Каждый Playwright-тест получает owned CONNECT egress в текущем immutable testhost: только `localhost:443 → traefik:443`, loopback-порт, `bun`, `/workspace`, mounts0 и отдельный статический IPv4 из проверенного actual network CIDR. Приватный lease ledger сохраняет адрес после удаления контейнера на всё окно source rate budget; занятые адреса, чужие labels и stale locks не очищаются. Browser loopback bypass выключен в test launch и явно в per-context option `<-loopback>,127.0.0.1,localhost:80`; numeric127.0.0.1 fixture URLs и только HTTP-вход `localhost:80` обходят прокси. Реальный redirect ведёт на HTTPS443 через closed CONNECT proxy. Политика rate limit/Origin и signed BFF source не меняются, foreign keys не сбрасываются. Два actual cases проверяют разные native source counters, а не только настройку proxy. С каждым тестом записываются фактические channel/version и allocated address.

E03/E08 используют отдельную test-only BFF composition: реальные Mongo bindings, canonical native auth ports, production `sessionRequest`/`logout`/`resolveActor`, controlled provider failure и commit barriers. Браузер перенаправляет выбранный запрос к owned fixture; главный login, UI, cookie jar и SSR читают те же run-owned записи. Это доказательство ошибки внедрённого native порта и двух BFF-процессов, а не остановки обычного Nest-контейнера. Длинный cutoff задаётся только часами fixture. Fault controls доступны исключительно в тестовом host, не в обычных frontend/backend образах.

Публичные server subpaths `conversations/server/targets/index.ts`, `users/server/session/index.ts` и `lib/session/server/lifecycle.ts` предоставляют узкие операции без создания framework HTTP providers. Continuation вызывает владельца Conversations через явный порт; app только связывает существующие операции и транспорт. Отсутствие/запрет адресата отличается от provider/validation failure, чужая membership не даёт target, а Continue не отправляет сообщение.

Основание: [браузерная совместимость](browser-compatibility.md), [AGENTS.md](../AGENTS.md). Текущие результаты фаз записываются в private acceptance report; наличие карты не означает, что финальный прогон выполнен.

## DONE-03: извлечение и завершение ресурсов

`bun run check` включает повторно используемый Conversations behavioral contract
для исходного и скопированного isolated host, runtime import graph, отдельный
headless browser API и installed packed Kit production build с negative browser
server import. Сохраняется исходная FND-02 fixture. Это behavioral extraction,
без заявления о независимом microfrontend deployment или media package.

Unit cases воспроизводят shutdown owned WS wave, analytics projection, stalled
SMTP и pending BFF revocation: abort сам по себе не освобождает слот/ресурс;
close ждёт фактическое cleanup, unknown outcome сохраняется, новая wave/binding
не начинается. Отдельный deadline case подтверждает failed shutdown без ложного
успеха до settlement. Исходные RED failures и source GREEN записаны в
DONE-03 report (исторический результат; private логи не входят в поставку).

Prepared-image integration owner `__tests__/integration/shutdown.test.ts` выполняет
native HTTP in-flight drain до infrastructure release и real Mongo pending lease
после interrupted publication; новая connection читает тот же event identity и
подтверждает persisted completion. Она использует existing run-owned namespace,
не основной outbox/worker и не developer collections. Выполняй её с текущими
ROOT-prepared image flags, как остальные integration owners. Существующие
`__tests__/integration/realtime.test.ts` и BFF/provider recovery owners остаются
источником actual socket/Mongo cancellation и native revoke/refresh persistence;
вторая полная матрица ради этой задачи не создаётся.

BASE585d056/run9b6879fa:13/13 PASS,39 required PASS,14 deferred NOT-RUN.
Scoped fix72295553: source root620/0, BE22/0, compatibility9/0 и отдельные
Mongo startup2 cases/E03 Chrome+Edge2/0; основной full receipt остаётся BASE.
Эти результаты carried с точной provenance. Новые DONE-03 runtime images,
lifecycle acceptance и финальный independent whole-branch review — отдельные
gates; до их receipt новая версия не объявляется полной runtime acceptance.

## STORY-04: лента и восстановление объектов

Scoped owners: `__tests__/integration/stories/feed-cleanup.test.ts`,
`__tests__/abuse/stories/recovery.test.ts` и native HTTP probe
`apps/be-insta/__tests__/integration/stories/http.ts`. До STORY-08 это прямые
проверки в выделенном `insta-stories` project с подготовленным immutable
source image, без source mounts. STORY-08 включил этих владельцев в full runner; предыдущие task receipts остаются историческими.
Используются только синтетические actor IDs и уникальные префиксы объектов.

Feed-cache failure при работающей source quota допускает fallback: не более
четырёх одновременно обслуживаемых Mongo чтений ленты на runtime, пятый запрос
получает 503 и Retry-After. Полная недоступность общего Dragonfly означает
недоступность обязательной source quota: public feed/playback отвечают
503/Retry-After **до** нового Mongo чтения. Это ограничение доступности admission;
пустая успешная лента не подменяет отказ. HTTP probe различает контролируемую
ошибку только cache-порта и закрытое реальное соединение quota broker.

Очистка сначала фиксирует `cleanup_pending`, затем ждёт подтверждения DELETE.
Ошибка сохраняет profile/key и retry. `removed` снимает физический учёт,
но оставляет operation identity и canonical publication result для replay.
Устаревшая финализация не проходит CAS. Reconciler читает только заданные
retained profiles/prefixes, сохраняет cursor после успешно обработанной страницы
и начинает новый полный проход после конца списка. Только authoritative missing
разрешает orphan DELETE; Mongo failure и неполный provider response не являются
отсутствием. Поздний PUT после удаления подбирается следующим здоровым проходом.
Profiles обходятся последовательно, общий максимум — четыре object operations.

Jobs прекращают новые claims при shutdown и ждут фактического settlement.
15-second watchdog отмечает degraded, но не освобождает borrowed clients и
не объявляет незавершённую работу закрытой. Фактические source/image identities,
исходные ошибки, retries и границы controlled/real ports — в task-4 receipt;
эти scoped проверки не доказывают браузерные journeys, extraction или full E2E.

## STORY-08: подготовка и full scope

Сначала выполните `bun run check`. Заморозьте исходники до конца runtime batch:
FE/BE/testhost собираются из одного дерева, без source mounts. Для чистого checkout
`SOURCE_TREE` — `git rev-parse HEAD^{tree}`; при проверке локального staged snapshot
используется его tree. HEAD и source tree — разные значения. Manifest перечисляет
SHA-256 всех app/tests/config файлов, исключая Markdown/docs receipts.

```sh
export COMPOSE_PROJECT_NAME=insta-stories
SOURCE_TREE=$(git rev-parse 'HEAD^{tree}')
SOURCE_MANIFEST=$(bun -e 'import {readAcceptanceSource} from "./scripts/testing/stories/source"; console.log((await readAcceptanceSource()).hash)')
docker build --target frontend --build-arg SOURCE_TREE="$SOURCE_TREE" --build-arg SOURCE_MANIFEST="$SOURCE_MANIFEST" -t "insta-stories-fe:$SOURCE_TREE" .
docker build --target backend --build-arg SOURCE_TREE="$SOURCE_TREE" --build-arg SOURCE_MANIFEST="$SOURCE_MANIFEST" -t "insta-stories-be:$SOURCE_TREE" .
docker build --target testhost --build-arg SOURCE_TREE="$SOURCE_TREE" --build-arg SOURCE_MANIFEST="$SOURCE_MANIFEST" -t "insta-stories-testhost:$SOURCE_TREE" .
```

Сборки идут последовательно. Используйте реальные image IDs из `docker image inspect`,
не tag как identity. Root Dockerfile включает native ffmpeg и собирает controlled
contact renderer через public Svelte API перед упаковкой testhost. Fixture endpoint
существует только в тестовом host; обычные runtime routes его не предоставляют.

```sh
bun scripts/infra/stories/prepare.ts --fe=sha256:FE_DIGEST --be=sha256:BE_DIGEST --testhost=sha256:TESTHOST_DIGEST
docker tag sha256:TESTHOST_DIGEST insta-stories-testhost
export COMPOSE_FILE=compose.yaml:.infra/stories-compose.json
docker compose --profile stories up -d --no-build --pull never
bun run check:full --scope=full \
  --stories-profile=.infra/stories-compose.json \
  --testhost-image=sha256:TESTHOST_DIGEST \
  --fe-image=sha256:FE_DIGEST --be-image=sha256:BE_DIGEST \
  --telemetry-profile=.infra/stories-optional.json \
  --default-profile=.infra/stories-defaults.json
```

Подготовка сохраняет имеющийся storage secret и создаёт приватные enabled,
optional/default и отдельный disabled Core profiles. RustFS закреплён на
`rustfs/rustfs:1.0.1@sha256:1803faef57627e2d9c2e7d89d655d712ddded5389040054987163043fecb6a3c`,
volume `stories-storage:/data`. Setup проверяет private permissions, точные app
images, одинаковые source labels/manifest, actual running Stories config, user
`bun`, отсутствие mounts приложений и ownership storage volume. Optional/default
должны сохранять исходные storage settings; restore выполняется и при ошибке.
Секреты не печатаются. Запуск не меняет доверие сертификатам и не удаляет данные.
Одновременно обслуживать host-порты двух projects нельзя; состояние другого
проекта сначала проверяется оператором. Нельзя автоматически удалять его сеть/data.

Все 14 media parts имеют owner paths в общей карте. A03 включает native multipart
и real RustFS PUT с контролируемой задержкой settlement: pending/cancelled операции
удерживают физические слоты, persisted effect/ownership проверяются в Mongo/S3.
A17 использует native Linux decoder для whole-file validation. Извлечение Stories
повторяет public publish/feed/expiry/frontend cleanup в скопированном host;
packed installed Kit проверяет SSR recorder и negative server-only browser import.
Это package extraction, не independent microfrontend deployment.

Основные Chrome и Edge owners выполняются последовательно, каждый с прежним
command deadline 15 минут. Per-test deadlines и assertions не увеличиваются;
новая граница даёт максимум 30 минут двум каналам. Успех одного канала не
покрывает FAIL/NOT-RUN другого. Smoke остаётся отдельной filtered фазой.
Egress readiness ждёт и marker контейнера, и ответ CONNECT через его owned
published loopback port в исходном readiness budget. При ошибке сохраняются
только image/state/port/ready-marker metadata в private artifact 0600, без
environment, raw provider logs, cookies и тел запросов. Исторический proxy FAIL
и успешный retry остаются разными receipts; readiness hardening не доказывает
причину старого сбоя.

Результаты source и runtime checks фиксируются отдельно. Synthetic browser permission denial
не считается проверкой физических camera/mic или OS permission prompts.

Для synthetic portable media fixtures DockerCOPY сохраняет локальные Unix
permissions. Tracked public assets должны быть читаемы пользователем `bun`
(файлы0644, каталоги0755); private diagnostics сохраняют0600/0700. Content
manifest не доказывает filesystem permissions: сверяйте actual image read
и immutable IDs. Browser/media compatibility проверяется отдельно от source checks.

## Независимый Docker lifecycle

Изолированные owners под `__tests__/integration/docker/` и `__tests__/e2e/docker/`
исключены из стандартного phase discovery для Core и Full. Они запускаются
напрямую через Bun/Playwright по явным paths, как ниже; `test:integration`,
`test:e2e` и `check:full` их не включают. Это отдельный lifecycle scope с
project `insta-docker-*`, тогда как обычные runners сохраняют свои project guards.

Focused owner `__tests__/integration/docker/lifecycle.host.test.ts` запускается
на хосте и управляет только заранее подготовленным project `insta-docker-*`.
Нужны точные FE/BE/testhost image IDs с одинаковым текущим executable manifest,
приватный Compose overlay с этими image IDs и `build: !reset null`, готовая
Mongo/Dragonfly/Mailpit и свободные порты. Не используй developer project:
проверка намеренно останавливает и пересоздаёт выбранные app containers.

```sh
COMPOSE_PROJECT_NAME=insta-docker-acceptance \
COMPOSE_FILE=compose.yaml:.infra/docker-acceptance.yaml \
INSTA_VERIFY_FE_IMAGE=sha256:FE_DIGEST \
INSTA_VERIFY_BE_IMAGE=sha256:BE_DIGEST \
INSTA_VERIFY_TESTHOST_IMAGE=sha256:TESTHOST_DIGEST \
  mise exec -- bun test __tests__/integration/docker/lifecycle.host.test.ts --timeout 180000
```

Заменяй примеры настоящими64-символьными digests. Lifecycle owner доказывает
backend-only, frontend live200/ready503 без backend, возвращение ready200,
отдельное force-recreate обоих app с сохранением другого container ID,
infra IDs, двух run-owned Mongo записей и broker generation. У app проверяются
actual image IDs и mounts0. Удаляются только собственные synthetic collections;
project/volumes остаются до `mise run compose:down`.

`__tests__/e2e/docker/lifecycle.spec.ts` использует существующие synthetic auth/chat
fixtures и CONNECT egress, входит по явному path. После реального login и send
пересоздаёт backend/frontend отдельно, затем проверяет тот же web-session cookie,
current actor и единственное canonical сообщение. Для него задаются те же
INSTA_VERIFY_* values, AUTH05_TESTHOST_IMAGE и CHAT03_TESTHOST_IMAGE (один exact
prepared testhost), COMPOSE_PROJECT_NAME и free published ports. Основные
Playwright auth/product и conversations/chat owners остаются независимыми
проверками OTP, реальных двух участников, WebSocket и offline replay.

Whole Core CLI разрешает только `insta-core`, Full только `insta-stories`.
Project guards сохранены. Когда эти имена заняты borrowed developer стендами,
не останавливай их ради тестов. Запуск selected existing owners напрямую в
run-owned prepared testhost/browser fixture является scoped evidence; он не
означает прохождение всего `check:full`. Фазы whole runner, отказавшего в setup,
должны остаться not-run. Текущие source/images, ошибки/retries и реально
выполненные фазы фиксируются в private acceptance report.


Review regression `__tests__/config/docker-ownership.test.ts` запускает native
Bun/Playwright CLI через controlled Docker read fixture и localhost persistence
sink. Foreign checkout отклоняется до Docker mutations/persistence и browser
CONNECT egress; stale image provenance не вызывает cleanup. Partial seed
сохраняет cleanup attempt и исходную ошибку при failure cleanup. Existing
ownership API и withResource reused; guard scope ограничен Docker lifecycle spec.
Source/image provenance фиксируется отдельно от исторических широких фаз.

## Message marks

Первичные владельцы переиспользуют существующие Mongo/native HTTP/WS owners:
`__tests__/integration/conversations-receipts.test.ts` и
`__tests__/abuse/conversations/receipts.test.ts`. Новый продуктовый owner
`__tests__/e2e/conversations/message-marks.spec.ts` включён в E05:chat и автоматически
обнаруживается prepared runner. Он запускает реальные headed Chrome/Edge для
наблюдения hidden/focus, проверяет exact persisted IDs/timestamps/sequence через
run-owned CHAT05 fixture и записывает outbound batches/receipt WS frames.
Fixture endpoint `/marks` существует только в testhost и читает диалоги synthetic
Alice; обычные приложения его не предоставляют. Cleanup включает receipt
collections и actor receipt quota.

После подготовки точных immutable images используйте те же image flags, что выше:

```sh
bun run test:integration __tests__/integration/conversations-receipts.test.ts --testhost-image=sha256:TESTHOST_DIGEST --fe-image=sha256:FE_DIGEST --be-image=sha256:BE_DIGEST
bun run test:abuse __tests__/abuse/conversations/receipts.test.ts --testhost-image=sha256:TESTHOST_DIGEST --fe-image=sha256:FE_DIGEST --be-image=sha256:BE_DIGEST
bun run test:e2e __tests__/e2e/conversations/message-marks.spec.ts --testhost-image=sha256:TESTHOST_DIGEST --fe-image=sha256:FE_DIGEST --be-image=sha256:BE_DIGEST
```

Не запускайте другие headed UI checks параллельно: смена foreground меняет
проверяемый факт focus. Core остаётся Stories-disabled. Scoped acceptance не
заменяет полный Core/Stories batch; реальные source/image/channel identities,
initial failures и remaining gaps фиксируются в private acceptance report.

## Исправления logout и времени активности — 16 октября 2026

Проверены локальные изменения поверх `714b6115130573430591e2979d3602d541ff70c8`.
SHA-256 изменённых `.ts`/`.svelte` файлов:
`fbe1ee589471fbfcadb2f49077d4b8bf14c5da0e351cee3c6b9585aa8cfa8374`
(пути в лексикографическом порядке, каждый путь и содержимое разделены NUL).
Коммита нет. Первоначальный source-прогон был без новых runtime images;
последующий локальный runtime-прогон описан ниже.

Logout-cleanup зарегистрирован корневым layout и приобретает отдельное соединение
очереди только при явном выходе. Уход из чатов и переавторизация сохраняют pending
records; logout очищает только очередь прежнего пользователя. Существующий
active-outbox cleanup сохранён, повторное удаление идемпотентно. Mongo `$max`
не позволяет позднему сообщению уменьшить `lastActivityAt`, сохраняя `createdAt`
сообщения и атомарное увеличение sequence.

- RED → GREEN: новая регрессия logout после dispose и проверка атомарного Mongo update.
- PASS: lint, architecture/module/API boundaries, типы, OpenAPI drift, Svelte-check
  (0 ошибок/предупреждений), сборки tooling/backend/frontend.
- PASS: общий набор 1139; frontend unit 139 и compiler 16; backend unit 144.
- Compatibility вне sandbox: 64 PASS, 1 SKIP, 0 FAIL. Linux WebM resource-limit
  case пропущен на macOS; это не доказательство Linux-проверки.
- Первый `bun run check`: 1132 PASS / 7 FAIL из-за `EPERM` в packed-package fixtures
  и chmod скопированного симлинка Lefthook. Изолированный writable Bun cache и
  обычная копия Lefthook в `PATH` дали 22/22 PASS для этих семи файлов.
- Повторный `bun run check` прошёл все предшествующие фазы, но завершился с FAIL
  на CSS HMR deadline (compatibility 63 PASS / 1 SKIP / 1 FAIL). Отдельный HMR
  повторился внутри sandbox и прошёл вне него; затем весь compatibility-набор
  прошёл вне sandbox без изменения исходников и таймаутов. Полный sandbox-прогон
  не объявляется безусловно зелёным. Сборка также сообщала конфликт
  `NO_COLOR`/`FORCE_COLOR`; это предупреждение форматирования вывода.

Новые runtime owners включены в существующие suites:
[Mongo activity](../apps/be-insta/__tests__/integration/conversations/activity.test.ts)
через [conversations integration](../__tests__/integration/conversations.test.ts)
и logout вне чатов в [outbox E2E](../__tests__/e2e/conversations/outbox.spec.ts).
Первоначально оба runtime-сценария оставались NOT RUN. Затем 16 октября выполнен
отдельный локальный прогон на Colima Linux arm64, Compose project `insta-core`,
Stories disabled. Использованы свежие immutable images без source/dependency
mounts, user `bun`. Проверены exact running image IDs, healthy FE/BE,
disabled configuration и совпадение executable/config/test manifest с checkout.
HTTPS `/api/health/ready` и `/` вернули 200.

Полный source manifest:
`a26c1b6a528d19bc398bbcc6d2163d635f3df14826bc452e0c55dfc7015d3ca1`.
Label `insta.source-tree` содержит базовое HEAD tree
`fcf8efe638ca5f2ee7336d18bdbbf9f90568b034`; локальные незакоммиченные изменения
идентифицирует manifest, а не этот базовый tree.

| Образ | Exact image ID |
| --- | --- |
| FE | `sha256:43b988f5ce89e62f8004d9dcb784313585da3de77a4445327f9dc24372812832` |
| BE | `sha256:be5e47ee504c23d67e85fc7cae3bf610e151d0f79ba974818ad1b5c222aee92a` |
| Testhost | `sha256:4b5a36c619f7db493b9c0407dbb230007f09bdcfb1696bbcaede1f4ad11f1fee` |

- Mongo integration — PASS, 1 выбранный root owner, 0 FAIL; соседний тест
  отфильтрован. Реальная Mongo-транзакция проверила timestamps `3000 → 1000 → 5000`,
  активность `3000 → 3000 → 5000`, исходные timestamps сообщений и sequences 4–6.
- Product E2E logout — PASS, 2/2, без retries: Chrome `155.0.8059.84`
  и Edge `155.0.4283.45`. Настоящий composer сохранил pending message в IndexedDB;
  полная навигация вне чатов сохранила его, logout удалил, повторный login
  подтвердил пустую очередь. Использованы synthetic accounts, Mailpit и отдельный
  owned CONNECT egress для каждого браузера.
- Первичная сборка была остановлена sandbox-ограничением записи Buildx activity;
  разрешённая сборка вне sandbox завершилась успешно. Продуктовые тесты прошли
  с первой попытки.

Команды узкого прогона (overlay содержит exact IDs из таблицы):

```sh
docker compose --project-name insta-core -f compose.yaml -f .infra/fix-runtime-compose.json --profile test run --pull never --rm --no-deps --user bun testhost bun test ./__tests__/integration/conversations.test.ts --test-name-pattern 'reordered messages' --timeout 60000
AUTH05_TESTHOST_IMAGE=sha256:4b5a36c619f7db493b9c0407dbb230007f09bdcfb1696bbcaede1f4ad11f1fee COMPOSE_PROJECT_NAME=insta-core COMPOSE_FILE=compose.yaml:.infra/fix-runtime-compose.json bun node_modules/@playwright/test/cli.js test --config __tests__/e2e/playwright.config.ts __tests__/e2e/conversations/outbox.spec.ts --grep 'explicit logout outside conversations'
```

Private receipt и логи: `.infra/fix-runtime-20261016/`. Тестовые fixtures завершили
cleanup, сервисы этого прогона остановлены. Сохранены images и отдельные volumes
`insta-fix-20261016-{mongo,dragonfly,mailpit}-data`; прежние developer volumes
не удалялись. Пуша нет. Этот узкий прогон не является полной Core/Stories,
abuse или аппаратной приёмкой.

## Исторические промежуточные проверки Streams — 20 октября 2026

Этот раздел описывает состояние до завершения последующих исправлений. Его
переходные diagnostics и pending пункты не определяют текущее состояние;
актуальные результаты приведены в разделе текущего прогона ниже.

Новые root host owners: `__tests__/integration/realtime-streams.host.test.ts`,
`realtime-capacity.host.test.ts`, расширенный `broker-restore.host.test.ts`;
они включены в A13 scenario enrollment и действительно обнаруживаются runner.
Host/fault suite после review corrections: 15 PASS, 79 assertions; BE units: 145 PASS, 720 assertions;
real Mongo expiry: 2 PASS, 13 assertions. Проверены persisted effects после
unknown XADD response/Lua error, отсутствие ложного ready, stale lease, два
runtime readers, shared reader cleanup, потеря ready без следующего event,
published-tail restore, receipt/message order, explicit expiry и три cold
physical generations с защищёнными auth/current/unknown keys.

Streams host tests используют реальный pinned Dragonfly 1.34.2 и deterministic
journal port fixture; native expiry tests используют реальный Mongo. Это ещё
не combined dedicated runtime и не финальная browser/CoreFull приёмка.
Общий broker 256 МБ capacity gate FAIL сохраняется. Dedicated 1gb / 1536 MiB
calibration: 4 PASS, 144 assertions, 1712.85 s; fan-out и conservative profiles
1/3 entries/s за 24 h прошли полное восстановление, независимый auth256 работал
во всех samples. Максимум: 259 200 entries, 446 009 085 encoded B,
538 676 688 B peak used_memory; restored 538 676 544 B, RSS 558 624 768 B.
Измерительный процесс загрузил source до review corrections, поэтому это
calibration evidence, а не финальная exact-image acceptance.

Task 3b подключает отдельные config/init/lifecycle/health и Core/Full setup.
Provider+routed suite: 7 PASS, 38 assertions, 46.11 s. Изолированный Traefik →
BFF → Nest проверяет новый fixture runtime при выключенной delivery:
реальные login/session, создание диалога, Mongo-запись сообщения, HTTP200 с
`delivery: degraded`; delivery-only restart сохраняет auth ticket/generation.
После собственного bootstrap commands и delivery health восстанавливаются.
Provider checks включают alias того же физического auth broker, повторные
bounded connect failures без offline replay, отмену blocked XREAD и отдельного
health probe. Run-owned containers/volumes/networks удаляются по labels.
Этот прогон использует подготовленный dependency image с read-only source
mounts и текущий FE build; это намеренно inner-loop proof, не immutable release.
Обычные приложения и developer volumes этим сценарием не изменяются.

Core/Full setup отдельно проверяет delivery generation/init, pinned resource
policy, отдельный volume, совпадение backend/testhost URL и `delivery: ok`.
Source manifest автоматически включает новые executable/test/config owners;
A13 включает оба новых host сценария. Финальные Core, Full, abuse и browser
фазы Task 6 ещё не выполнялись. Strict wire consumers Task 4/5 пока дают
переходные TypeScript diagnostics. Нельзя считать это unconditional root check
PASS. Дополнительный Task 3 idle-pruning correction ожидает отдельного source
handoff; Task 3b его не реализует.
Точные команды, логи и итоговый freeze fingerprint находятся в Task 3 report:
исходные тестовые owners перечислены выше.

Task 3b source checks: contracts generation/check и module boundaries PASS;
backend units145 PASS/720 assertions, новые lifecycle barriers2 PASS/5 assertions,
scoped config/lifecycle47 PASS/256 assertions. Root check проходит Biome
(0 errors,57 infos) и boundaries, затем останавливается на13 Task4/5 wire
TypeScript diagnostics; architecture conts advisory Task3 сохранён.
Полный config run:182 PASS/1 FAIL (Vite30s timeout), focused retry1 PASS/4 assertions
без изменения timeout. Причина задержки не установлена; retry не отменяет
исходный failed run. Подробности и логи — Task3b report рядом с Task3 report.

Task 3b correction round 1 добавляет A13 ordinary-launcher сценарий:
отдельный workspace/Compose project проходит настоящий `compose:backend`
с недоступной delivery; HTTP login и canonical Mongo message commit доступны,
retrying infrastructure init завершает bootstrap после возврата provider без
restart backend. После следующего cold restart успешный старый init не
маскирует degraded: recovery требует явного повторного launcher. Это source
mount inner-loop proof; точные runtime versions, image ID, исходные failed runs
и результаты закреплённого повторного прогона — в Task 3b report.
Correction round1 final pinned Bun1.4.2: ordinary launcher1 PASS/12 assertions
(63.31s), scoped config26 PASS/115 assertions, enrollment12 PASS/144 assertions.
Biome2494 files/0 errors/70 infos, boundaries PASS; architecture сохраняет прежний
Task3 warn-mode advisory, typecheck — те же13 Task4/5 diagnostics. Runtime использует
проверенный setup image `sha256:3ffae9dbcdd2b74d454803380608822198006b3f0c35fa1da6a4e4ea66debfb2`
с source overlays; ошибочная промежуточная сборка заменила прежний setup tag, исходный
aa90 image отсутствует и NOT RESTORED. Все собственные runtime resources удалены;
это не отменяет initial fixture failures, unpinned preliminary PASS или Task6 debt.

## Проверки до последней F7 правки — 20 октября 2026

Общий source-прогон текущей реализации завершился без ошибок: root 1290 tests,
frontend 171, frontend compiler 20, backend 172, compatibility 64 PASS и один
Linux-only decoder SKIP на macOS. Svelte diagnostics: 0 errors, 0 warnings.
Linux decoder обязателен внутри prepared testhost. Это source evidence,
а не результат итогового Core/Full acceptance.

В Google Chrome 155.0.8059.85 и Edge 155.0.4283.62 прошли 52 проверки UI
components и 30 message marks; даты — 2 проверки Chrome. Chrome подготовлен
из официального подписанного дистрибутива отдельно от системных приложений.
Browser walkthrough пока остановлен ошибкой самоподписанного сертификата;
системное доверие не менялось. Автоматические Playwright owners используют
существующую тестовую TLS-настройку.

Первый Docker native delivery wrapper превысил 30 s при параллельной сборке;
прямой BE случай позднее прошёл: 1 PASS, 12 assertions, 12.48 s всего.
Причина первого timeout не установлена; повтор не отменяет FAIL.
Adversarial native delivery owner в первом прогоне прошёл отдельно.

Dedicated capacity calibration остаётся предварительной: 4 профиля,
144 assertions, 1712.85 s, максимум 259200 entries и peak used_memory
538676688 B. Итоговый gate должен повторить все четыре профиля с auth и restore.
Они запускаются отдельными командами в прежнем 15-minute budget, без сокращения
данных или увеличения лимита случая. Ранний общий broker 256 MiB gate FAIL
сохраняется отдельно.

Scanner сохраняет advisory для статической Lua-композиции из локальных
immutable strings. Изменённые constants вручную проверены: JS functions,
environment reads и I/O в них отсутствуют. Advisory не подавлен; это замечание
к новой форме исходников и ограничение scanner, а не исторический долг.

Полный Core runner остановлен по запросу пользователя. Его предыдущий freeze:
source manifest `8f2b6895309ffdb39f823ffcef4a13ff6db2468e4db30f47e14920e7b2f77761`,
prepared tree `3a0390000596b0d29111095dafc03a9fcffafaa7`, run ID
`255446a7-3c82-4891-adf0-6be9e347f58c`. Завершённые результаты не меняются
на NOT RUN после остановки:

| Фаза предыдущего freeze | Фактический результат |
| --- | --- |
| Tooling/type/build и contracts/unit | PASS |
| Provider integration | PASS: 62 tests, 444 assertions |
| Host integration | PASS: 38 tests, 262 assertions |
| Dedicated delivery capacity | PASS: все 4 профиля за 24 h, полный cold restore и healthy auth; максимум 259200 entries, peak used_memory 538676688 B |
| Provider abuse | PASS: 29 tests, 213 assertions |
| Host abuse | PASS |
| Основной Core Playwright Chrome и Edge | FAIL: CSP owner не дождался subscribed; ожидалось 1, получено 0 |
| Core smoke | INTERRUPTED: runner остановлен после первого passing case |
| Оставшиеся Core phases и полный Full scope | NOT RUN: остановлены пользователем |

Общий итоговый report.json не сформирован: runner остановлен до завершения
оркестрации. Исходные приватные command logs сохранены локально; passing
отдельных фаз не превращает весь прогон в PASS.

## Завершение F7 — 21 октября 2026

После предыдущего freeze исправлен поздний отказ `/continue`: новый recovery
выбор прекращает применение результата старого intent и очищает его локальный
статус. Уже существующий recovery при подписке не отменяет явно выбранный URL.
Подписка освобождается при cleanup страницы.

Executable manifest F7:
`33b6544335e08158581ab554fb8879163c96517ca3d8ce7231f6080cdc068b7e`.
Frontend пересобран из этого исходника без source mounts:
`sha256:1e447afb3abf01d5cd2171754aa0759a83c02db921aa00c3107915664bdb442b`.
Backend и fixture testhost не менялись после предыдущего freeze:
`sha256:dc033d4d1e9696b5d41c29e47812def1782b1e34e021df33e027f490eae9f1c1`
и `sha256:f702fa7bdb0e3d9a88b04271e2ec42066b4d4fc279208506b8c685243386ac51`.
Это scoped F7 evidence с пересобранным FE, не новый combined Core/Full freeze.

| Проверка окончательного исходника | Результат |
| --- | --- |
| Frontend Svelte/typecheck, Bun 1.4.2 | PASS: 0 errors, 0 warnings |
| Frontend production Docker build, Bun 1.4.2 | PASS |
| F7 Stories, Chrome 155.0.8059.85 | PASS: 3/3, 48.0 s, без retries |
| Остальные source/runtime/browser/abuse/capacity phases после последней F7 правки | NOT RUN по запросу пользователя |
| Edge F7, HTTP/3, telemetry/default restoration | NOT RUN |
| Ручной Browser walkthrough | NOT RUN: self-signed certificate; системное доверие не менялось |
| Независимое финальное ревью всей ветки | NOT RUN: выполнен self-review без субагентов |

Три F7 cases проверяют поздний отказ предыдущего выбора и адресную отмену
поздней квитанции после закрытия Story для guest/authenticated. Story создаётся
через настоящую публикацию и storage fixture; физические camera/mic этим
прогоном не проверяются. Приватный лог: `f7-stories-final.log` в локальном
workspace плана. Полный runner не возобновлялся; commit/amend/push не выполнялись.

После проверки удалены 22 контейнера и пустые сети двух run-owned acceptance
projects, а также 24 устаревших image tags. Все 9 volumes этих проектов и 7
контейнеров developer project сохранены; финальные FE/BE/testhost images оставлены
для воспроизводимости. Глобальный prune и удаление volumes не выполнялись.

## Исправление CSP fixture — 21 октября 2026

Старый CSP server возвращал прежний subscription ACK и отправлял событие без
delivery envelope/callback. Теперь он переиспользует `createSubscriptionServer`:
prepare выдаёт token/baseline, событие отправляется после exact activate,
сервер проверяет applied ACK со всеми четырьмя coordinates. Browser probe
создаёт нового connection owner после synthetic 401 и явно использует jitless
валидацию prepared response. При этом запрет eval в CSP сохранён.

Scoped owner `__tests__/e2e/conversations/csp.spec.ts`: Chrome 155.0.8059.85
и Edge 155.0.4283.62 — 2/2 PASS, 14.0 s, без retries. Проверены отказ первой
авторизации, второй ticket, prepare/activate, применение события и точный ACK.
Biome изменённых трёх файлов и root TypeScript no-emit — PASS, Bun 1.4.2.
Executable manifest после правки:
`269a9e1e5d3dd4dbfb60b96f04b34344b696ff80a8a3cfadb867fc5bc5d9b05a`.

Изменены только тестовые owners. CSP server и browser bundle собраны из текущего
checkout; egress использовал прежний immutable testhost
`sha256:f702fa7bdb0e3d9a88b04271e2ec42066b4d4fc279208506b8c685243386ac51`.
Для его readiness запускался только pinned Traefik upstream без published ports,
mounts и volumes. Egress containers, временный upstream и сеть удалены после
проверки. Application services и полный runner не запускались.

Первый повтор остановился на egress setup; затем воспроизведён исходный
`subscribed=0`, сохранён промежуточный failing browser run. Финальный passing
прогон относится исправленному CSP owner. Исторические Core Chrome/Edge phases
остаются FAIL: целиком они не повторялись. Остальные отложенные phases — NOT RUN.
Нагрузочный риск пересчёта retained Mongo range этой правкой не изменён.

## Stories WS: локальная проверка 2026-10-21

Source manifest: `4e87da79ffd080b65127a78acc8b9aab56f9bbed757bb5f28dc9a86cb0562416`, HEAD `02ceb289bb354eddceb770e5d649c0dbf32c5ea6` с незакоммиченными изменениями. Full-проект `insta-acceptance-full-f2f2c4becab8`, URL https://localhost:24444. Запущенные application image IDs:

- Backend: `sha256:1a350dc08bfa7975f7c926d31f23a0d3c404383223994a97d0850916ac0c977b`.
- Frontend: `sha256:322ab9633af11a92885cf266f79a0370c20e80ba0ae62af16bd619f283af1f59`.

Результаты этого изменения:

- PASS — backend realtime/Stories unit: 72/72; browser Stories/realtime unit: 176/176; contracts: 69/69.
- PASS — Mongo provider в одноразовом Docker testhost с текущими source mounts: 14/14. Проверены rollback Story + notification, идемпотентный replay публикации, rollback совместного подтверждения, монотонный retention, сохранение pending source и явная ошибка при потере живой journal-записи. Только изолированные test-owned коллекции удаляются fixture cleanup.
- PASS — root/backend TypeScript, Svelte check (0 errors, 0 warnings), module/API boundaries, scoped Biome и git diff --check.
- PASS — сборка обоих application Docker images и readiness. На финальных images: bod публикует, elena получает то же событие второй раз после retry-later; отключённый клиент получает два события после resume.
- PASS — встроенный браузер: открытая сессия elena, публикация bod отдельной сессией; список авторов обновился и bod переместился первым без reload/смены вкладки. Это отдельная UI-проверка; protocol retry/replay проверен реальными Socket.IO-клиентами. Unit-регрессия также проверяет появление ранее отсутствовавшего автора до applied ACK.
- NOT RUN — полный Core/Full acceptance, полная abuse-матрица, Chrome/Edge compatibility matrix и HTTP/3 для этой ревизии. Ранее выполненные проверки не переносятся на новую ревизию автоматически.

Предварительный смешанный запуск из корня импортировал Nest policy test без backend tsconfig и завершился ошибкой decorators; после разделения явных путей browser-набор и backend-набор прошли отдельно. Full оставлен запущенным; developer volumes и чужие Compose-проекты сохранены. Commit/push не выполнялись.

## Исправление доступа к чужому чату, 2026-10-21

PASS — 90/90 focused тестов `chat05` и Svelte SSR presentation, включая HTTP 403/404 против 503, WS FORBIDDEN, удаление cached сообщений, смену аккаунта через guest, сохранение маршрута при обновлении того же пользователя, RU/EN текст и отсутствие composer у закрытого чата. PASS — Svelte check (0 ошибок, 0 предупреждений) и production frontend build. Полный acceptance, Docker/browser runtime этой ревизии — NOT RUN: локальные контейнеры и данные ранее удалены по запросу пользователя. Проверки source перед amend дополнены штатными Git hooks; Git-даты не являются датами выполнения проверок.
