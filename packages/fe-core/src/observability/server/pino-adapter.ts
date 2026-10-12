import pino from "pino";
import { logFields } from "../contracts/conts";
import { clientGoalSchema } from "../contracts/projections";
import { whitelistRecord } from "../contracts/whitelist";
import { readLogCorrelation } from "./context";
import { defaultFlushTimeoutMs, safePinoRedactionPaths } from "./conts";
import { normalizeNativeLevel } from "./lib/normalize-level";
import type { PinoAdapter, PinoAdapterOptions } from "./types";
/** Создаёт Pino с allowlist, redaction и контекстной корреляцией; close ожидает ограниченный flush, не закрывая переданный destination. */
export const createPinoAdapter = ({
  identity,
  level = "info",
  destination,
  flushTimeoutMs = defaultFlushTimeoutMs,
  resolveClientGoal,
}: PinoAdapterOptions): PinoAdapter => {
  const logger = pino(
    {
      level,
      base: null,
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        /** Преобразует native label в разрешённый уровень логирования. */
        level: (label) => ({ level: normalizeNativeLevel(label) }),
        /** Исключает автоматические bindings Pino из итоговой записи. */
        bindings: () => ({}),
      },
      redact: { paths: [...safePinoRedactionPaths], remove: true },
      hooks: {
        /** Удаляет message/interpolation, применяет allowlist и текущую trace-корреляцию, затем добавляет только валидную client goal projection перед сериализацией. */
        logMethod(args, method, numericLevel) {
          const input =
            typeof args[0] === "object" && args[0] !== null ? args[0] : {};
          // Drop all interpolation/message arguments before Pino can serialize them.
          const correlation = readLogCorrelation();
          const safe = whitelistRecord({
            input: {
              ...input,
              level: normalizeNativeLevel(pino.levels.labels[numericLevel]),
              ...correlation,
              [logFields.traceId]: correlation.trace_id,
              [logFields.spanId]: correlation.span_id,
            },
            identity,
          });
          const goal = clientGoalSchema.safeParse(
            safe.client ? resolveClientGoal?.(safe.client) : undefined,
          );
          const payload: Record<string, unknown> = {
            ...safe,
            ...(safe.client && goal.success
              ? { client: { ...safe.client, goal: goal.data } }
              : {}),
          };
          delete payload.level;
          method.call(this, payload);
        },
      },
    },
    destination,
  );
  let closing: Promise<"flushed" | "failed" | "timeout"> | undefined;
  return Object.freeze({
    logger,
    /** Передаёт структурированную запись методу Pino её уровня с общей фильтрацией hook. */
    emit: (record) => logger[record.level](record),
    /** Идемпотентно ожидает flush до таймаута и различает flushed, failed и timeout; не заявляет подтверждённую внешнюю доставку. */
    close: () => {
      closing ??= new Promise((resolve) => {
        const timer = setTimeout(() => resolve("timeout"), flushTimeoutMs);
        try {
          logger.flush((error) => {
            clearTimeout(timer);
            resolve(error ? "failed" : "flushed");
          });
        } catch {
          clearTimeout(timer);
          resolve("failed");
        }
      });
      return closing;
    },
  });
};
