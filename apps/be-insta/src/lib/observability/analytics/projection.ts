import type { ConsentReference } from "@insta/fe-core/observability/analytics";
import { analyticsSinkNames } from "./conts";
/** Создаёт отдельный снимок согласия и pending-состояния sinks только при наличии ссылки; без неё projection отсутствует. */
export const originalProjection = (reference?: ConsentReference) =>
  reference
    ? {
        projection: {
          reference: { ...reference },
          deliveries: {
            [analyticsSinkNames.logOnly]: {
              state: "pending" as const,
              leaseUntil: 0,
              nextAttemptAt: 0,
            },
            otel: {
              state: "pending" as const,
              leaseUntil: 0,
              nextAttemptAt: 0,
            },
          },
        },
      }
    : {};
