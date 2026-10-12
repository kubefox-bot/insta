import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  type ClientSourceInput,
  encodeSourceAssertion,
  sourceAddressSchema,
  sourceAssertionPolicy,
  sourceAssertionSchema,
  sourceHeaders,
} from "@insta/contracts/http";
/** Принимает digest BFF только после проверки подписи, возраста и контекста запроса; иначе использует хеш peer-адреса. */
export const readClientSource = ({
  headers,
  peer,
  method,
  pathname,
  key,
  now,
}: ClientSourceInput & Readonly<{ key?: string | undefined; now: number }>) => {
  const address = sourceAddressSchema.safeParse(peer);
  /** Строит локальный идентификатор источника без доверия к пересланным заголовкам; неизвестный peer попадает в общую группу. */
  const fallback = () =>
    createHash("sha256")
      .update(address.success ? address.data : "unknown")
      .digest("hex");
  if (!key) return fallback();
  const parsed = sourceAssertionSchema.safeParse({
    digest: headers[sourceHeaders.digest],
    issuedAt: headers[sourceHeaders.issuedAt],
    signature: headers[sourceHeaders.signature],
  });
  if (!parsed.success) return fallback();
  const { digest, issuedAt, signature } = parsed.data;
  const ageMs = now - issuedAt;
  if (
    ageMs > sourceAssertionPolicy.maximumAgeMs ||
    ageMs < -sourceAssertionPolicy.futureSkewMs
  )
    return fallback();
  const expected = createHmac("sha256", Buffer.from(key, "hex"))
    .update(encodeSourceAssertion({ method, pathname, digest, issuedAt }))
    .digest();
  const supplied = Buffer.from(signature, "base64url");
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(expected, supplied)
  )
    return fallback();
  return digest;
};
