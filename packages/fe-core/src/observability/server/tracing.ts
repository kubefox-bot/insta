import { Result } from "@bloodyowl/boxed";
import { context, ROOT_CONTEXT, SpanKind, trace } from "@opentelemetry/api";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { traceScopeName } from "./conts";
import { createEffectContext } from "./effect-context";
import { acquireTraceContext } from "./trace-context";
import type { EffectContextInput, TracingOptions } from "./types";
/** Создаёт локальный tracer provider и lease context manager без exporter; consent проверяется для каждого scope, close освобождает provider и lease. */
export const createTracing = ({
  readPermission = () => "denied",
}: TracingOptions = {}) => {
  const release = acquireTraceContext();
  // No span processor or exporter: real spans and propagation, no delivery claim.
  const provider = new NodeTracerProvider();
  const tracer = provider.getTracer(traceScopeName);
  const effectContext = createEffectContext(tracer);
  const propagator = new W3CTraceContextPropagator();
  let closing: Promise<void> | undefined;
  /** Перед extraction и созданием server span проверяет текущее permission; отказ или denied выполняет работу в ROOT_CONTEXT без span. */
  const startScope = ({
    name,
    headers,
  }: Readonly<{
    name: string;
    headers: Readonly<Record<string, string | undefined>>;
  }>) => {
    // Permission is evaluated for each attempt, before extraction or span creation.
    const permission = Result.fromExecution(readPermission);
    if (!permission.isOk() || permission.get() !== "allowed")
      return {
        /** Выполняет callback в корневом контексте без наследования trace при отсутствии разрешения. */
        run: <T>(execute: () => T): T => context.with(ROOT_CONTEXT, execute),
        /** Завершает scope без span пустой операцией, сохраняя единый контракт cleanup. */
        end: () => {},
      };
    const parent = propagator.extract(ROOT_CONTEXT, headers, {
      /** Предоставляет propagator имена входных заголовков без их изменения. */
      keys: (carrier) => Object.keys(carrier),
      /** Предоставляет propagator значение заголовка по запрошенному ключу. */
      get: (carrier, key) => carrier[key],
    });
    const span = tracer.startSpan(name, { kind: SpanKind.SERVER }, parent);
    const active = trace.setSpan(parent, span);
    /** Выполняет callback в контексте созданного server span. */
    const run = <T>(execute: () => T): T => context.with(active, execute);
    return {
      run,
      /** Завершает принадлежащий scope server span. */
      end: () => span.end(),
    };
  };
  return Object.freeze({
    /** Создаёт разрешённый effect context до начала закрытия; после close возвращает undefined. */
    effectContext: (input: EffectContextInput) =>
      closing ? undefined : effectContext(input),
    startScope,
    /** Ожидает callback в scope и обязательно завершает span в finally, сохраняя результат или ошибку callback. */
    withSpan: async <T>({
      name,
      headers,
      execute,
    }: Readonly<{
      name: string;
      headers: Readonly<Record<string, string | undefined>>;
      execute: () => T | Promise<T>;
    }>): Promise<T> => {
      const scope = startScope({ name, headers });
      try {
        return await scope.run(execute);
      } finally {
        scope.end();
      }
    },
    /** Идемпотентно ожидает shutdown provider и освобождает context lease даже при ошибке shutdown. */
    close: (): Promise<void> => {
      closing ??= provider.shutdown().finally(release);
      return closing;
    },
  });
};
