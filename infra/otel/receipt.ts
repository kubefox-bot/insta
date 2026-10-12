import {
  faroProtocol,
  safeFaroBodySchema,
} from "../../apps/fe-insta/src/lib/observability/client/index";
import { traceSchema } from "./schema";
/** Проверяет payload по схеме Faro либо OTLP, выбранной путём, и возвращает только протокол и число событий/spans без исходного содержимого. Неизвестный путь или невалидная схема дают undefined. */
export const decodeTelemetryReceipt = ({
  path,
  payload,
}: Readonly<{ path: string; payload: unknown }>) => {
  if (path === "/collect") {
    const body = safeFaroBodySchema.safeParse(payload, { jitless: true });
    return body.success
      ? {
          protocol: faroProtocol,
          count:
            (body.data.exceptions?.length ?? 0) +
            (body.data.measurements?.length ?? 0),
        }
      : undefined;
  }
  if (path !== "/v1/traces") return undefined;
  const body = traceSchema.safeParse(payload, { jitless: true });
  return body.success
    ? {
        protocol: "otlp-json" as const,
        count: body.data.resourceSpans
          .flatMap((resource) => resource.scopeSpans)
          .flatMap((scope) => scope.spans).length,
      }
    : undefined;
};
