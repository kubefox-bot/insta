import { ROOT_CONTEXT, SpanKind, type Tracer } from "@opentelemetry/api";
import type { EffectContextInput } from "./types";
/** Связывает заимствованный tracer с созданием отдельного effect span только при allowed permission; фиксирует начало/конец по occurredAt, возвращает span context и всегда завершает созданный span. */
export const createEffectContext =
  (tracer: Tracer) =>
  ({ permission, name, occurredAt }: EffectContextInput) => {
    if (permission !== "allowed") return undefined;
    const timestamp = new Date(occurredAt);
    const span = tracer.startSpan(
      name,
      {
        kind: SpanKind.INTERNAL,
        startTime: timestamp,
      },
      ROOT_CONTEXT,
    );
    try {
      return span.spanContext();
    } finally {
      span.end(timestamp);
    }
  };
