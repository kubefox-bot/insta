import { z } from "zod";
export const storedReportSchema = z.object({
  reportId: z.uuid(),
  owner: z.object({ kind: z.enum(["guest", "user"]), id: z.string() }),
  fingerprint: z.string(),
  idempotencyKey: z.string(),
  operationId: z.string(),
  comment: z.string(),
  errorCode: z.string(),
  originalRequestId: z.string().optional(),
  createdAt: z.number(),
  expiresAt: z.number(),
  replayExpiresAt: z.number(),
  leaseId: z.string(),
  attempts: z.number(),
});
