import { z } from "zod";
import { supportPolicy } from "../../domain/conts";
export const supportClaimsSchema = z.object({
  sub: z.uuid(),
  [supportPolicy.tokenUseClaim]: z.literal(supportPolicy.tokenUse),
  iat: z.number().int().nonnegative(),
  exp: z.number().int().positive(),
});
