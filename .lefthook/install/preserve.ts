import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { HOOK_FILENAMES } from "./conts.ts";

/** Перечисляет записи каталога hooks, кроме файлов .sample; отсутствующий каталог даёт пустой список, ошибки чтения не скрываются. */
export const activeHooks = (directory: string): readonly string[] =>
  existsSync(directory)
    ? readdirSync(directory).filter((name) => !name.endsWith(".sample"))
    : [];

/** До записи отвергает посторонние имена и hooks без ожидаемого вызова Lefthook. Проверяет текстовый маркер, разрешая checksum; содержимое каталога не меняет. */
export const assertOwnedTarget = (directory: string): void => {
  const managedNames: readonly string[] = Object.values(HOOK_FILENAMES);
  for (const name of activeHooks(directory)) {
    if (name === "lefthook.checksum") continue;
    if (
      !managedNames.includes(name) ||
      !readFileSync(join(directory, name), "utf8").includes(
        `call_lefthook run "${name}" "$@"`,
      )
    )
      throw new Error(
        `Чужой hook сохранён: ${join(directory, name)}. Установка остановлена.`,
      );
  }
};
