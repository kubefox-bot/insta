import type { GoalProjection } from "@insta/fe-core/observability/analytics";
import { otlpPolicy } from "./conts";
import type { EffectContext } from "./types";
/** Кодирует canonical goal в OTLP span с наносекундными timestamps и ограниченным набором бизнес-атрибутов. */
export const encodeOtlpGoal = ({
  event,
  context,
}: Readonly<{ event: GoalProjection; context: EffectContext }>) => {
  const start = String(
    BigInt(Math.floor(event.occurredAt)) *
      BigInt(otlpPolicy.nanosecondsPerMillisecond),
  );
  return {
    resourceSpans: [
      {
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: "be-insta" } },
          ],
        },
        scopeSpans: [
          {
            scope: { name: "insta.canonical" },
            spans: [
              {
                traceId: context.traceId,
                spanId: context.spanId,
                name: event.operation,
                kind: otlpPolicy.internalSpanKind,
                startTimeUnixNano: start,
                endTimeUnixNano: start,
                attributes: [
                  {
                    key: "analytics.event_id",
                    value: { stringValue: event.analyticsEventId },
                  },
                  { key: "business.goal", value: { stringValue: event.goal } },
                  { key: "business.code", value: { stringValue: event.code } },
                ],
                status: { code: otlpPolicy.okStatus },
              },
            ],
          },
        ],
      },
    ],
  };
};
