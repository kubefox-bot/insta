import { z } from "zod";

const base = {
  emailKey: z.string(),
  emailVerifiedAt: z.date(),
  registrationExpiresAt: z.date(),
};
export const userSchema = z.discriminatedUnion("status", [
  z.strictObject({ ...base, status: z.literal("pending_setup") }),
  z.strictObject({
    ...base,
    status: z.literal("active"),
    username: z.string(),
    usernameKey: z.string(),
    passwordHash: z.string(),
  }),
]);
