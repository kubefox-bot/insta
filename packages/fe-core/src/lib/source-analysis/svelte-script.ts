import { parse } from "svelte/compiler";

/**
 * Keep instance/module scopes separate; the compiler owns script discovery.
 * Извлекает исходный текст стандартных script-блоков в виртуальные модули;
 * препроцессоры и markup expressions не преобразует, ошибки Svelte parser пробрасывает.
 */
export const readSvelteScripts = (
  sourceText: string,
  filename: string,
): ReadonlyMap<string, string> => {
  const root = parse(sourceText, { filename, modern: true });
  const scripts = [root.module, root.instance].filter(
    (script) => script !== null && script !== undefined,
  );
  return new Map(
    scripts.map((script) => {
      const start: unknown = Reflect.get(script.content, "start");
      const end: unknown = Reflect.get(script.content, "end");
      if (typeof start !== "number" || typeof end !== "number")
        throw new Error(`Нет диапазона Svelte script: ${filename}`);
      return [
        `${filename}.${script.context}.ts`,
        `${sourceText.slice(start, end)}\nexport {};\n`,
      ];
    }),
  );
};
