# Совместимый фасад локального HAP UI

Единственная реализация Svelte 5 и дизайн-токены принадлежат `packages/fe-core/src/ui`.
Основной API — `@insta/fe-core/ui` и `@insta/fe-core/ui/styles.css`;
`@insta/ui-kit` сохраняет совместимые поимённые экспорты и CSS import без копий.
Публичный API: `Button`, `Input`, `Textarea`, `Dialog`, `Icon`, `Menu`, `Avatar`,
поимённые messenger-иконки и их props-типы из `@insta/fe-core/ui`.
Совместимый `@insta/ui-kit` переэкспортирует тот же API без второй реализации.
Токены подключаются один раз через выбранный публичный CSS subpath. Приватные пути
компонентов и токенов не являются API. Пакет не содержит domain stores,
configuration/environment access, React или Mantine.

```svelte
<script lang="ts">
  import { Button, Input, Textarea, Dialog } from "@insta/ui-kit";
  import "@insta/ui-kit/styles.css";
  let text = $state("");
</script>
<form method="post">
  <Input label="Email" type="email" name="email" required />
  <Textarea label="Сообщение" name="message" bind:value={text} />
  <Button type="submit">Отправить</Button>
</form>
<Button href="/?mode=login" variant="text">Войти</Button>
```

Пользовательский текст, включая labels, ошибки, title, description и closeLabel,
передаёт приложение из своего RU/EN каталога. Loading сохраняет текст children
и выставляет `aria-busy`; вызывающий код может передать текст ожидания.

## Компоненты

- Button: `variant="primary|secondary|text"`, `size="sm|md|lg"`, `loading`,
  `disabled`, native button **или** anchor attributes и обязательный children
  snippet. Без href используется button с default `type="button"`; для form
  submit нужен явный `type="submit"`. Name/value/form и form action атрибуты
  доступны button; href исключает submit/form атрибуты. Link остаётся нативным
  anchor. Disabled/loading удаляет href уже из серверной разметки, сохраняет
  role=link/aria-disabled и исключает элемент из Tab-порядка. Поэтому primary
  и middle-click не навигируют даже без JavaScript; enabled href/native attributes
  сохраняются. Button disabled/loading использует native disabled.
- Input/Textarea: обязательный label, optional error/id и native attributes/events,
  в том числе name, required, readonly, disabled, autocomplete. Value можно
  передать или связать через `bind:value`. Label связан с control; error добавлен
  в aria-describedby и aria-invalid. Пользовательский aria-describedby сохраняется.
  `$props.id()` обеспечивает стабильный id при SSR/hydration без global counter.
- Dialog: controlled open, title, description, closeLabel, onClose и children.
  Bits UI 2.19.5 владеет portal, focus trap, Escape, outside dismissal и возвратом
  фокуса. onClose просит владельца обновить open; состояние бизнес-сценария
  принадлежит вызывающему коду. После открытия фокус попадает в первый control.

- Icon: `name="chat|settings|cookie|logo|en|ru"`; SVG принадлежит пакету и скрыт
  от accessibility tree. Доступное имя и title задаёт приложение у кнопки или
  ссылки, в которой используется иконка. Прежний размер по умолчанию — 1.4rem,
  флаги сохраняют свои размеры. Дополнительные `size="sm|md|lg"` используют
  существующие icon-токены, `tone="default|muted|error"` — цвет родителя или
  соответствующий UI-токен. SVG paths имеют одного renderer-владельца.
- Поимённые `SearchIcon`, `ClearIcon`, `SendIcon`, `BackIcon`, `CloseIcon`,
  `CameraIcon`, `PlusIcon`, `SettingsIcon`, `ClockIcon`, `CheckIcon`,
  `DoubleCheckIcon`, `ErrorIcon` доступны из `@insta/fe-core/ui/icons` и основного
  UI entrypoint. Принимают только общие `IconProps` (`size`, `tone`); скрыты от
  accessibility tree. Кнопка/ссылка владеет подписью действия и focus/touch area.
- Avatar: `{identity, username, label, decorative?}`. Username может быть null:
  нейтральный знак `?`. Первые два Unicode-графема переводятся в верхний регистр,
  один не дополняется; identity определяет устойчивый тон независимо от username
  и порядка списка. Standalone имеет role=img и label; внутри уже названного
  control используйте `decorative`, чтобы не повторять имя. Размер задаёт общий
  `--ui-avatar-size` (2.5rem); владелец размещения может переопределить его локально.
  Компонент не знает про маршруты, Stories, пользователей или stores.
- Menu: label, children snippet и readonly items с label/onSelect. Bits UI
  владеет клавиатурным выбором, Escape, outside dismissal и focus return.
  Выбранный callback вызывается после закрытия меню и возврата фокуса к trigger,
  чтобы открываемый владельцем Dialog затем вернул фокус к тому же control.
  Menu не содержит domain stores или действий приложения.

## Токены и происхождение

Пять portable файлов перенесены из `NewStartBy/fe-hap-ui`, commit
`7ac7bfd5ef6371e60a4d4bc039de8b2856808fb8`, без изменения значений:
`primitives/{color,typography,icon}.css`, `composite/typography.css` и
`aliases/button.css`. HAP сохраняет primary/hover/pressed/disabled данные
и размерные padding/font aliases; Mantine runtime не переносится.

Новый `aliases/interface.css` задаёт семантические поверхности page/panel/muted/
selected, text/muted/error, border/control-border, focus, spacing, radius,
overlay/shadow и минимальную интерактивную область 44px. Шкала spacing:
0.25/0.5/0.75/1/1.5/2rem; radius controls 0.5rem, panels 0.75rem.
Основной фон — #f9f6f2, панели — #fff, текст — #241f1b; primary — #a35841.
Все компоненты используют CSS Modules. Совпадающие field styles Input/Textarea
принадлежат внутреннему `components/lib/field` и переиспользуются через composes.

Типографика HAP: body 0.75/0.825/1/1.125rem и heading 1.25–4rem; веса 400/500.
Inter выбирается при наличии на устройстве, иначе sans-serif fallback.
В репозитории нет локальных woff/woff2/ttf/otf assets; сетевой font import не добавлен,
поэтому точный Inter и идентичность шрифта референсу не гарантируются.
Focus-visible имеет 2px outline и 3px offset; reduced motion выключает переходы.

Контраст рассчитан по sRGB относительной яркости, ratio округлён до двух знаков:

| Текст / фон | Ratio |
| --- | --- |
| white / primary #a35841 | 5.21 |
| primary #a35841 / white | 5.21 |
| text #241f1b / page #f9f6f2 | 15.15 |
| muted #544e49 / white | 8.19 |
| error #d72845 / white | 4.91 |
| focus #884029 / white | 7.47 |
| control border #7d756e / white | 4.52 |

Это проверенные пары активных элементов; muted исходные neutral-300/400
используются только в disabled states, а не как основной текст.

## Проверки

`bun run test:ui` запускает отдельную Vite SSR/hydration fixture на loopback
127.0.0.1:4178 через Playwright и закрывает собственный сервер. Chrome и Edge,
retries=0; fixture покрывает native FormData, loading/disabled, anchor navigation,
label/error, focus trap, Escape, focus return и стабильные SSR ids. Примеры всех
button sizes/variants и error/readonly/disabled состояний изолированы в __tests__;
в продуктовых routes и builds их нет.

`bun run check:ui` (или `bun run --cwd packages/ui-kit check`) проверяет
Svelte-реализацию `fe-core/src/ui`, фасад и типовые контракты. UI-kit остаётся
владельцем fixtures и совместимого TS6/svelte-check; runtime-компоненты,
Bits UI и токены принадлежат fe-core. Отдельный tooling build fe-core
не собирает UI и не включает его декларации.
Root source checks включают этот check и boundary tests: public root/CSS imports
принимаются, private component/token imports и package→app отклоняются.
Production fixture build проверяет фактические chunk.modules на React/Mantine и
server configuration imports:

```sh
bun --bun apps/fe-insta/node_modules/vite/bin/vite.js build --config packages/ui-kit/__tests__/fixtures/vite.config.ts
```

SvelteKit потребляет source package с `ssr.noExternal`; Docker dependency layer
копирует manifest до frozen workspace install. Проверка fixture не заменяет
application E2E, database integration или deployment evidence.

Фактические application-проверки header, native auth, private SSR, conversations,
offline и RU/EN запускаются через сценарии из [документации тестирования](../../docs/testing.md).
Package fixtures не доказывают app lifecycle, persistence или присутствие локального Inter.
