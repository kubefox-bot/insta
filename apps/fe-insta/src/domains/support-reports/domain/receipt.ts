import { z } from "zod";
export const supportReceiptSchema = z.strictObject({
  reportId: z.uuid(),
  emailState: z.enum(["pending", "accepted", "failed"]),
});
