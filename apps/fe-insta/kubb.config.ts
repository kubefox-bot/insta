import { pluginClient } from "@kubb/plugin-client";
import { pluginOas } from "@kubb/plugin-oas";
import { pluginTs } from "@kubb/plugin-ts";
import { pluginZod } from "@kubb/plugin-zod";
/**
 * Настраивает генерацию wire-типов, Zod-схем и REST-клиентов из backend OpenAPI. Клиенты
 * используют только серверный transport; закрытость DTO сохраняется при записи схем.
 */
export const createKubbConfiguration = ({
  openapi,
  output,
}: {
  readonly openapi: string;
  readonly output: string;
}) => ({
  input: { path: openapi },
  output: { path: output, clean: true, barrelType: false as const },
  plugins: [
    pluginOas(),
    pluginTs({ output: { path: "types", barrelType: false } }),
    pluginZod({
      version: "4",
      output: { path: "schemas", barrelType: false },
      unknownType: "unknown",
      transformers: {
        /**
         * Сохраняет backend UUID pattern вместо дополнительного UUID-ограничения
         * генератора. Для остальных схем возвращает исходные преобразования без
         * изменений.
         */
        schema: ({ schema }, defaults) => {
          if (schema?.format !== "uuid" || !schema.pattern) return defaults;
          return [
            ...defaults.filter(
              (value) =>
                value.keyword !== "uuid" && value.keyword !== "matches",
            ),
            { keyword: "matches", args: schema.pattern },
          ];
        },
      },
      // Every current wire object is closed. Kubb4 drops additionalProperties:
      // false in nested outputs; its supported writer callback preserves that
      // contract. New open-object DTOs need a generation fixture before use.
      /**
       * Восстанавливает strictObject для текущих закрытых wire DTO, включая вложенные
       * объекты. Открытые DTO требуют отдельной проверки генерации перед добавлением.
       */
      wrapOutput: ({ output }) =>
        output.replaceAll("z.object(", "z.strictObject("),
    }),
    pluginClient({
      importPath: "../../server/transport.server.ts",
      dataReturnType: "full",
      output: { path: "clients", barrelType: false },
    }),
  ],
});
