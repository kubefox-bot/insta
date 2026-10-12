import { z } from "zod";
export const publicUserSchema = z.strictObject({
  id: z.string().regex(/^[a-f0-9]{24}$/),
  username: z.string(),
});
export const refreshCredentialsSchema = z.strictObject({
  user: publicUserSchema,
  backendSessionId: z.uuid(),
  accessToken: z.string(),
  accessExpiresAt: z.number().int(),
  refreshToken: z.string(),
  expiresAt: z.number().int(),
  absoluteExpiresAt: z.number().int(),
});
export const sessionCredentialsSchema = refreshCredentialsSchema.extend({
  revokeSecret: z.string(),
});
export const refreshProofSchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[A-Za-z0-9_-]{43}$/,
  );
