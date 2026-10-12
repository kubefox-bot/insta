import { z } from "zod";
import { receiverPolicy } from "./conts";

export const traceSchema = z.object({
  resourceSpans: z.array(
    z.object({
      scopeSpans: z.array(
        z.object({
          spans: z.array(
            z.object({
              traceId: z.string().regex(/^[0-9a-f]{32}$/),
              spanId: z.string().regex(/^[0-9a-f]{16}$/),
              name: z.string().regex(/^[a-z.]+$/),
              attributes: z.array(
                z.object({
                  key: z.enum([
                    "analytics.event_id",
                    "business.goal",
                    "business.code",
                  ]),
                  value: z.object({
                    stringValue: z
                      .string()
                      .max(receiverPolicy.maximumAttributeLength),
                  }),
                }),
              ),
            }),
          ),
        }),
      ),
    }),
  ),
});
