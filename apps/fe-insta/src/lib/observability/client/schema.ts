import { z } from "zod";
import {
  clientCodes,
  clientOperations,
  faroValues,
  intakePolicy,
  measurementMaximum,
  measurementNames,
} from "./conts";
export const clientEventSchema = z
  .object({
    analyticsEventId: z.uuid(),
    operationId: z.uuid().optional(),
    operation: z.enum([
      clientOperations.error,
      clientOperations.ui,
      clientOperations.realtime,
      clientOperations.http,
      clientOperations.storyPlayback,
    ]),
    code: z.string(),
  })
  .refine(
    (value) =>
      clientCodes[value.operation].some((code) => code === value.code) &&
      (value.operation !== clientOperations.storyPlayback ||
        Boolean(value.operationId)),
  );
export const clientBatchSchema = z.object({
  revision: z.number().int().positive(),
  policyVersion: z.number().int().positive(),
  events: z.array(clientEventSchema).min(1).max(intakePolicy.batchEvents),
});
export const safeFaroBodySchema = z
  .strictObject({
    meta: z.strictObject({
      app: z.strictObject({ name: z.literal(faroValues.appName) }),
    }),
    exceptions: z
      .array(
        z.strictObject({
          type: z.literal(faroValues.errorType),
          value: z.literal(faroValues.unhandledError),
          timestamp: z.iso.datetime(),
        }),
      )
      .max(intakePolicy.batchEvents)
      .optional(),
    measurements: z
      .array(
        z.strictObject({
          type: z.enum([faroValues.webVitals, ...measurementNames]),
          values: z.partialRecord(
            z.enum(measurementNames),
            z.number().finite().nonnegative().max(measurementMaximum),
          ),
          timestamp: z.iso.datetime(),
        }),
      )
      .max(intakePolicy.batchEvents)
      .optional(),
  })
  .refine((body) => {
    const total =
      (body.exceptions?.length ?? 0) + (body.measurements?.length ?? 0);
    return total > 0 && total <= intakePolicy.batchEvents;
  });
export const faroBatchSchema = z.strictObject({
  analyticsEventId: z.uuid(),
  revision: z.number().int().positive(),
  policyVersion: z.number().int().positive(),
  body: safeFaroBodySchema,
});
