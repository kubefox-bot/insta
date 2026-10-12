import { correlationSchema } from "@insta/contracts/http";
import { z } from "zod";
import { supportReceiptSchema } from "../domain/receipt";
export const supportReplySchema = z.strictObject({
  ok: z.literal(true),
  data: supportReceiptSchema,
  meta: correlationSchema,
});
export const supportErrorSchema = z.object({
  ok: z.literal(false),
  error: z.object({ code: z.string() }),
  meta: correlationSchema,
});
