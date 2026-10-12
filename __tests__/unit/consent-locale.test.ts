import { expect, test } from "bun:test";
import { messages } from "../../apps/fe-insta/src/lib/i18n/index";

test("runtime EN/RU consent keys and placeholders match", () => {
  const localeKeys = Object.keys(messages.en.consent).sort();
  expect(Object.keys(messages.ru.consent).sort()).toEqual(localeKeys);
  for (const key of localeKeys) {
    const english =
      Object.entries(messages.en.consent).find(([name]) => name === key)?.[1] ??
      "";
    const russian =
      Object.entries(messages.ru.consent).find(([name]) => name === key)?.[1] ??
      "";
    expect(english.match(/\{\w+\}/g) ?? []).toEqual(
      russian.match(/\{\w+\}/g) ?? [],
    );
  }
});
