import { storyPolicySchema } from "@insta/contracts/stories";
import { z } from "zod";
export const policySuccessSchema = z.strictObject({
  ok: z.literal(true),
  data: storyPolicySchema,
  meta: z.strictObject({
    requestId: z.string(),
    operationId: z.string().optional(),
  }),
});
