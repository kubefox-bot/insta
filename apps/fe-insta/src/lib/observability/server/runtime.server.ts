import "$app/server";
import {
  type ClientProjection,
  logFields,
  SCHEMA_VERSION,
} from "@insta/fe-core/observability/contracts";
import {
  createHttpCompletion,
  createObservabilityService,
  createPinoAdapter,
  createTracing,
  type PinoAdapterOptions,
  readLogCorrelation,
  withContext,
} from "@insta/fe-core/observability/server";
import type { readServerConfig } from "../../config/server/index";
import { identity } from "../conts";
/**
 * Собирает серверные логи, корреляцию и tracing из проверенной конфигурации.
 * Минимальные операционные логи не зависят от browser consent; допуск clientObserved
 * проверяет intake. Tracing удерживает lease контекста, но создан с denied по
 * умолчанию: HTTP spans не открываются. Владелец runtime обязан дождаться close.
 */
export const createObservability = (
  config: ReturnType<typeof readServerConfig>["observability"],
  projections: Pick<PinoAdapterOptions, "resolveClientGoal"> = {},
) => {
  const adapter = createPinoAdapter({ identity, ...config, ...projections });
  const tracing = createTracing();
  const runtime = createObservabilityService({
    identity,
    context: readLogCorrelation,
    uuid: crypto.randomUUID,
    clock: performance.now.bind(performance),
    adapters: [adapter],
  });
  let closing: Promise<void> | undefined;
  return Object.freeze({
    /**
     * Выполняет request callback с корреляцией через withSpan. Здесь tracing использует
     * denied по умолчанию, поэтому входящий trace не извлекается и span не создаётся;
     * результат или ошибка callback возвращаются через Promise tracing.
     */
    withRequest: <T>({
      correlation,
      headers,
      execute,
    }: Readonly<{
      correlation: Readonly<{ requestId: string; operationId?: string }>;
      headers: Readonly<Record<string, string | undefined>>;
      execute: () => T | Promise<T>;
    }>) =>
      withContext({
        context: correlation,
        /**
         * Передаёт callback в withSpan внутри установленной корреляции. При текущем
         * denied callback работает в ROOT_CONTEXT без нового span.
         */
        execute: () =>
          tracing.withSpan({ name: "http.request", headers, execute }),
      }),
    exception: runtime.exception,
    /**
     * Записывает принятую client projection на уровне info с версией схемы. Сам метод не
     * проверяет consent или дедупликацию; это обязанность intake до вызова.
     */
    clientObserved: (event: ClientProjection) =>
      adapter.logger.info({
        [logFields.schemaVersion]: SCHEMA_VERSION,
        [logFields.eventType]: "client_observed",
        client: event,
      }),
    /**
     * Создаёт отдельный completion recorder с идентичностью BFF и emit адаптера; запись
     * завершения выполняет вызывающий HTTP lifecycle.
     */
    completion: () => createHttpCompletion({ identity, emit: adapter.emit }),
    /**
     * Переиспользует один Promise закрытия: tracing освобождает свой lease контекста,
     * затем в finally закрывается log adapter. Неполный flush пишет в stderr;
     * отклонения остаются наблюдаемыми
     * вызывающему.
     */
    close: () => {
      closing ??= tracing.close().finally(async () => {
        const result = await adapter.close();
        if (result !== "flushed")
          process.stderr.write(`Observability shutdown ${result}\n`);
      });
      return closing;
    },
  });
};
