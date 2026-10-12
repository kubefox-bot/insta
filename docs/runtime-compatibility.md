# Совместимость runtime и toolchain

Основа auth/directory/conversations реализована. Source checks работают на macOS
arm64 под Bun1.4.2; runtime acceptance использует immutable Linux arm64 images
в Colima4CPU/4GiB. BASE585d056/run9b6879fa прошёл13 core-фаз; scoped fix source72295553
проверен отдельно. DONE-03 меняет lifecycle/source и требует своей новой сборки,
provider proof и независимого review. Старый digest не доказывает новые изменения.
Stories/media/storage и app Linux amd64 не проверены и не объявляются готовыми.

Ниже сохранены механизмы и версии foundation; исторические probe-результаты
не заменяют текущую core-матрицу в [testing.md](testing.md).

| Владелец | Зафиксированные версии | Проверка |
| --- | --- | --- |
| Workspace / fe-core | Bun 1.4.2, TypeScript 7.0.2, Biome 2.5.14 | Frozen install; прежние tooling fixtures, typecheck и build |
| Backend | Nest common/core/platform-express 12.1.2, Swagger 12.0.2, Zod 4.6.5 | Bun source и production HTTP; explicit DI; native Standard Schema pipe; Swagger → Kubb |
| Frontend | SvelteKit 3.0.1, Svelte 5.57.2, vite-plugin-svelte 7.3.1, Vite 8.3.3 | Dev SSR; client/server build; production server под Bun |
| Frontend adapter | Официальный @sveltejs/adapter-bun 1.0.0 | `dist/index.js` обслуживает SSR под Bun |
| Svelte tooling | svelte-check 4.7.6, @typescript/native-preview 7.0.0-dev.20260707.2 | `svelte-check --tsgo`: 0 errors, 0 warnings |
| Локальные peers | TypeScript 6.0.3 только в manifests be-insta и fe-insta | Swagger требует TS 5/6; Kit и svelte-check требуют TS 6; root TS 7 сохранён |
| CSS / UI | Lightning CSS 1.33.0, Bits UI 2.19.5, @internationalized/date 3.12.4 | SSR Dialog import; CSS Modules HMR; production CSS/JS class mapping |
| Генерация | Kubb core/plugin-oas/plugin-ts/plugin-zod/plugin-client 4.39.3; fabric-core/react-fabric 0.16.1 | Backend-owned OpenAPI 3.1 → types, Zod 4 schemas и server SDK; проверка drift |
| Server transport | ky 2.1.0 | Реальный Nest HTTP, retry: 0, timeout и ограниченное чтение body перед JSON parse |
| Runtime libraries | Boxed 3.4.0, jose 6.2.12, Pino 10.4.0 | Result import, JWT sign/verify, JSON logger output |

Backend typecheck явно запускает **root TS 7**, несмотря на локальную зависимость
TS 6 для Swagger peer. Svelte-check использует `--tsgo`; TS 6 сохраняется для
инструментов, которым нужен JS compiler API. fe-core сохраняет собственный
upstream compiler API и tests, миграции его поведения не было.

## Выбранные механизмы

Nest запускается с ExpressAdapter, Bun native compiler и legacy decorators из
backend tsconfig. `emitDecoratorMetadata` выключен: DI использует явные `@Inject`
tokens, HTTP validation — `@Body({ schema })` и `StandardSchemaValidationPipe`.
Fixture проверяет 400 на невалидный DTO, 201 на валидный и отсутствие вызова
handler для невалидного payload. Production bootstrap отдельно проверяет оба
health endpoints. Теперь `/health/ready` проверяет Mongo и fenced Dragonfly;
Mailpit отражается отдельно как degraded. Private admission fail-closed при
required dependency failure, без optional-mail ожидания в бизнес-handler.

OpenAPI fixture получает request schema через `z.toJSONSchema` с target
`openapi-3.0`. Узкий Zod validator принимает concrete object/string JSON Schema
перед передачей в Swagger; он не переписывает значения схемы и не использует
unsafe cast. Эта fixture доказывает путь Zod → Swagger → Kubb для одного request
DTO. Эта исходная compatibility fixture сохранена отдельно от FND-03 exporter.
Пустые response/error schemas fixture не являются продуктовым API.

FND-03 использует публичный Swagger 12 `standardSchema` и
`standardSchemaConverter`: backend Zod DTO экспортируются через `z.toJSONSchema`
в draft 2020-12, документ объявляет OpenAPI 3.1.0. Источник маршрутов — текущие
health endpoints: конкретные 200/data и 500/INTERNAL_ERROR envelopes с meta.
Продуктовые Auth/Chat endpoints уже добавлены backend owners; текущая генерация
проверяется contracts:check без подключения к инфраструктуре.

`packages/contracts` содержит portable HTTP/Message/WS wire-схемы. Notification
пока только закрытая fixture `system.info`; story-подпуть экспортирует только
общие limits, без реализации функции. Kubb custom ky client возвращает сырой
Response; server apiService ограничивает чтение, валидирует envelope и возвращает
Boxed Result с api/network/invalid_contract. HTML, неверный JSON, размер и status
mismatch проверены отдельно; chunked и stalled streams отменяются.

У Kubb 4 подтверждены две потери: closed objects и UUID pattern. Поддерживаемые
`transformers.schema` и `wrapOutput` сохраняют exported UUID pattern и strict
objects. Generation policy отклоняет будущие open-object DTO до генерации;
для них требуется отдельная faithful writer fixture. Generated файлы вручную
не редактируются. `contracts:check` генерирует во временную папку и сравнивает
все SDK-файлы и OpenAPI, включая лишние старые файлы.

Транспорт содержит `$app/server` marker. Реальный SDK упакован и установлен в
изолированную Kit 3 fixture: SSR build проходит, browser import отклоняется.
Portable realtime contracts отдельно собираются для браузера. API configuration
читает только server config owner: обязательный `API_BASE_URL`, optional
`API_TIMEOUT_MS` (5000, максимум 60000) и `API_MAX_RESPONSE_BYTES` (1048576,
максимум 16777216). Для тестов configuration передаётся явно.

Kubb генерирует файл во временной run-owned папке. Его стандартный fsStorage
разрешает keys относительно cwd, поэтому fixture сохраняет стандартный root и
использует абсолютный `output.path`. Проверяются реальный файл и отсутствие
`generated/types/CreateCompatibilityProbe.ts` в корне workspace; временная
папка удаляется в `finally`.

Kit 3 конфигурируется через `sveltekit(...)` в `vite.config.ts`, без удалённого
формата svelte.config.js. Build запускается `bun --bun vite build`; adapter-bun
создаёт production server. Bun-first вариант прошёл; adapter-node не требуется.
SSR fixture Bits UI использует ту же `SSR_CONFIGURATION`, что и приложение:
`noExternal` для bits-ui, runed и svelte-toolbelt позволяет Vite скомпилировать
их Svelte imports. UI fixture находится только в `__tests__`, в продуктовый route
не добавлена. Она проверяет SSR и client build, но не браузерные действия Dialog.

Biome сохраняет upstream severity и fixtures. Из его форматирования исключены
generated SDK, `.svelte-kit`, dist и node_modules; generated SDK остаётся в
typecheck и boundary checks. Default export разрешён только в Vite config и
Kubb-required custom transport. Backend parser понимает parameter decorators;
`useGlobalPipes`/`useGlobalFilters` исключены из ошибочной React hook эвристики.
FND-02 scanner проверяет реальные app owners и стандартные Svelte scripts;
FND-03 подключает contracts и actual SDK/transport/service. Arbitrary preprocessors,
markup expressions и conditional/wildcard package exports не доказаны.

## Команды

```sh
bun install --frozen-lockfile
bun run check:tooling
bun run check:apps
bun run check
bun run contracts:generate
bun run contracts:check
bun run dev:be
bun run dev:fe
```

`check:apps` выполняет backend TS 7, Svelte check, TS 7 для root fixtures,
оба production builds и compatibility tests. `check:tooling` выполняет lint,
нынешние boundary checks, fe-core typecheck, upstream tests и build.
`test:unit` объединяет tooling и compatibility suites; compatibility tests
используют уже собранные production entrypoints, поэтому предварительно нужен
`build:apps` или `check:apps`. Dev по умолчанию использует frontend :5173 и
backend 127.0.0.1:3001; smoke запускается на свободных локальных портах.

В первом app build было предупреждение о одновременно заданных `NO_COLOR` и
`FORCE_COLOR` в унаследованной среде; оно также сохранилось в полном check,
запущенном через `env -u FORCE_COLOR`, из-за среды вложенных Bun commands.
Отдельный build повторён с `env -u NO_COLOR -u FORCE_COLOR`, без изменения
глобальной среды. Поздняя Linux arm64 source/image parity и production runtime
имеют отдельные immutable receipts. Deployed runtime, production-only package
install и app amd64 acceptance не заявлены. Linux amd64 HTTP/3 diagnostic client
не является amd64 приложением. Native Chrome/Edge forced QUIC остаётся gap;
[browser compatibility](browser-compatibility.md) сохраняет историю.

DONE-03 shutdown проверяется отдельно: signal cancellation означает запрос
отмены, завершение означает actual settlement/cleanup. 15s watchdog reports
failure при исчерпании budget. HTTP drain, worker stop, Mongo/Dragonfly/SMTP close
и OTel/Pino имеют своих владельцев; root source checks не заменяют packaged
provider/runtime proof. [Архитектура](architecture.md) и [runbook](local-runbook.md)
описывают актуальный порядок.

## Официальные источники

- [SvelteKit Vite configuration](https://svelte.dev/docs/kit/@sveltejs-kit-vite): конфигурация Kit 3 через Vite plugin.
- [SvelteKit adapter-bun](https://svelte.dev/docs/kit/adapter-bun): Bun 1.4+, build под Bun, production server.
- [Zod JSON Schema](https://zod.dev/json-schema): `toJSONSchema` и OpenAPI target.
- [Svelte language tools](https://github.com/sveltejs/language-tools/tree/master/packages/svelte-check): native TypeScript mode; точные peer/API проверены также в установленных README и manifests.
- [Nest common source](https://github.com/nestjs/nest/tree/master/packages/common): StandardSchemaValidationPipe и schema option HTTP decorators сверены с установленными 12.1.2 declarations/implementation.

Версии и peer ranges выше сверены с установленными package.json и bun.lock.
Первоначальные raw RED записи прерванного implementer не сохранились в task
scratch: они не восстановлены и не заявлены как доказательство TDD. Свежие GREEN
проверки и RED→GREEN исправления утечки Kubb имеют отдельные task logs.
