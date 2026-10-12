import { z } from "zod";
export const correlationSchema = z.strictObject({
  requestId: z.uuid(),
  operationId: z.uuidv4().optional(),
  traceId: z
    .string()
    .regex(/^(?!0{32}$)[0-9a-f]{32}$/)
    .optional(),
});
