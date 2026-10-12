import { z } from "zod";
export const publicPreferenceSchema = z.strictObject({
  choice: z.enum(["necessary", "all"]),
  policyVersion: z.number().int().positive(),
  revision: z.number().int().nonnegative(),
});
export const saveChoiceSchema = z.strictObject({
  choice: z.enum(["necessary", "all"]),
  policyVersion: z.number().int().positive(),
  expectedRevision: z.number().int().positive().optional(),
});
