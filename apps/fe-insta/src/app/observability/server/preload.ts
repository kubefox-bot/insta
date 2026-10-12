import { logFields } from "@insta/fe-core/observability/contracts";
import { createPinoAdapter } from "@insta/fe-core/observability/server";
import { readLoggingConfig } from "../../../lib/config/server/index";
import { connectNativeConsole } from "../../../lib/observability/console/index";
import { identity } from "../../../lib/observability/index";

const adapter = createPinoAdapter({ identity, ...readLoggingConfig() });
/**
 * Подключение заменяет native console защищённой записью уровня без аргументов; возвращённый
 * restore зарегистрирован на exit и восстанавливает методы после shutdown listeners.
 */
const restore = connectNativeConsole({
  target: console,
  /**
   * Перенаправляет событие native console в соответствующий уровень защищённого Pino logger с
   * категорией system; исходный текст здесь не передаётся.
   */
  emit: (level) => adapter.logger[level]({ [logFields.eventType]: "system" }),
});
// Keep native methods protected through all shutdown listeners. Restore only
// when this process exits; the connector also exposes restoration to tests.
process.once("sveltekit:shutdown", () => {
  adapter.close().catch(() => {
    /* Closing diagnostics cannot change the shutdown result. */
  });
});
process.once("exit", restore);
