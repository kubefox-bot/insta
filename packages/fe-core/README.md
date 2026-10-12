# fe-core

Локальный приватный пакет `@insta/fe-core` предоставляет общий Biome preset,
TypeScript-конфигурацию, проверки исходников и узкие контракты наблюдаемости для
`fe-insta` и `be-insta`. Пакет не публикуется (`private: true`).

## Происхождение

Основа tooling перенесена из локального `NewStartBy/fe-core`, ревизия
`25179cab2353ff2199557dd1bc2134811d3d3180`, по запросу пользователя.
Исходный репозиторий не изменялся. Перенесены исходники, тесты и Biome preset;
registry credentials, CI, release workflows, React UI и Storybook не переносились.
Next-specific preset сохранён для совместимости его тестов, но к SvelteKit и
Nest не применяется. Уровни правил Biome сохранены.

## Публичные входы

- `@insta/fe-core/biome` — общий Biome preset.
- `@insta/fe-core/tsconfig` — TypeScript-база.
- `@insta/fe-core/lints` — программные API проверок.
- `insta-lints` — Bun CLI с командами `architecture`, `module-boundaries` и
  `api-boundaries`.
- `@insta/fe-core/observability/{browser,server,business,analytics,otel,contracts}`
  — отдельные входы для соответствующих контрактов. Серверный вход имеет
  browser-ограничение в package exports.

Потребители используют объявленные package subpaths, не приватные файлы `src/`.
Compiler API использует закреплённый TypeScript 7.0.2.

## Проверки workspace

Из корня `bun run lint` запускает Biome и архитектурный анализатор;
`bun run lint:boundaries` проверяет корневые и локальные границы модулей и
frontend API. `bun run typecheck` проверяет tooling и корневые исходники.
`bun run check` включает также тесты и сборки приложений; результат каждой
фазы нужно учитывать отдельно. Сборка создаёт `dist`, но CLI и workspace API
запускаются Bun непосредственно из исходников.

`architecture` использует `module-style` в advisory-режиме. Его правила для
`types.ts`/`*.types.ts`, `props.ts`, `interfaces.ts` и `conts.ts` проверяют
чистоту файлов. `module-boundaries` блокирует нарушения слоёв, циклы,
приватные импорты между объявленными владельцами и browser/server границы.
Корневые и прикладные конфигурации охватывают реализованные `fe-insta`,
`be-insta`, shared packages и infra; `api-boundaries` защищает объявленные
frontend transport и API пути. Фикстуры проверяют положительные и
отрицательные случаи для alias, относительных импортов и публичных subpaths.

Анализатор читает Git-tracked и untracked, но не ignored файлы; нужен Git
repository. Коммиты для запуска не требуются. Стандартные JS/TS скрипты
Svelte, включая instance, module и legacy module, участвуют в статических
проверках. Произвольные preprocessors, выражения в markup и conditional или
wildcard package exports ими не покрыты и требуют ручной проверки.

Статические проверки не подтверждают транзакции базы, поведение Dragonfly,
работу приложения в браузере, интеграционные, abuse или E2E сценарии. Их
фактические фазы и идентичность исходника фиксируются отдельно в
`docs/testing.md`.

## Общий UI

`@insta/fe-core/ui` экспортирует Button, Input, Textarea, Dialog, Menu, Icon
и существующие props-контракты. Компоненты и CSS Modules находятся в `src/ui/components`,
единственные токены — в `src/ui/tokens`. CSS подключается один раз через
`@insta/fe-core/ui/styles.css`. Приватные component/token paths не являются API.

UI не зависит от приложения, tooling или server API и не экспортируется из
`/lints` либо observability. Bits UI принадлежит этому runtime-пакету.
`@insta/ui-kit` сохраняет прежний API как поимённый фасад и CSS import.
`bun run check:ui` использует существующий TS6/Svelte checker и fixtures
UI-kit для нового владельца; tooling fe-core остаётся на существующем TS7
и его build/declarations исключают UI. [Контракты и fixtures](../ui-kit/README.md).
