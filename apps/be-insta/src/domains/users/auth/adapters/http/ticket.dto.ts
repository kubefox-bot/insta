import { correlationSchema } from "@insta/contracts/http";
import { z } from "zod";
export const wsTicketSuccessSchema = z.strictObject({
  ok: z.literal(true),
  data: z.strictObject({
    ticket: z.uuid(),
    expiresAt: z.number().int().positive(),
  }),
  meta: correlationSchema,
});
