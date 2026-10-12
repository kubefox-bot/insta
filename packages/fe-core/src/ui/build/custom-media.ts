import { Features } from "lightningcss";
import type { Plugin } from "vite";
import { mediaQueries } from "../tokens/breakpoints/queries.ts";
import { CSS_MODULE_ID, UI_MEDIA_PLUGIN_NAME } from "./conts.ts";

/** Создаёт Vite pre-plugin, добавляющий общие breakpoint definitions в CSS Modules и требующий Lightning CSS для раскрытия custom media. */
export const createUiMediaPlugin = (): Plugin => {
  const definitions = `@custom-media --ui-compact ${mediaQueries.compact};\n@custom-media --ui-split ${mediaQueries.split};\n`;
  return {
    name: UI_MEDIA_PLUGIN_NAME,
    enforce: "pre",
    /** Включает draft custom media и соответствующее преобразование, сохраняя ранее заданные include-флаги. */
    config(config) {
      return {
        css: {
          lightningcss: {
            drafts: { customMedia: true },
            include:
              (config.css?.lightningcss?.include ?? 0) |
              Features.CustomMediaQueries,
          },
        },
      };
    },
    /** Отклоняет конфигурацию без Lightning CSS, чтобы custom media не остались необработанными. */
    configResolved(config) {
      if (config.css.transformer !== "lightningcss") {
        throw new Error(
          "UI custom media requires the Lightning CSS transformer",
        );
      }
    },
    /** Дописывает определения media перед исходником только CSS Modules; возвращает map: null, остальные модули пропускает. */
    transform(source, id) {
      if (!CSS_MODULE_ID.test(id)) return;
      return { code: definitions + source, map: null };
    },
  };
};
