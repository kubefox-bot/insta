import { z } from "zod";
import { mappedIpv4Prefix } from "./conts";
export const sourceAddressSchema = z
  .string()
  .transform((value) =>
    value.startsWith(mappedIpv4Prefix)
      ? value.slice(mappedIpv4Prefix.length)
      : value,
  )
  .pipe(z.union([z.ipv4(), z.ipv6()]));
export const sourceAssertionSchema = z.strictObject({
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  issuedAt: z
    .string()
    .regex(/^\d{1,16}$/)
    .transform(Number)
    .pipe(z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)),
  signature: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});
