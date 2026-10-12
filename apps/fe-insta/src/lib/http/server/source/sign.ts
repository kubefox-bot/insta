import { createHash, createHmac } from "node:crypto";
import {
  encodeSourceAssertion,
  type SourceRequest,
  sourceHeaders,
} from "@insta/contracts/http";
/**
 * Хеширует клиентский источник и подписывает assertion, связанный с method/path/time.
 * Возвращает backend-заголовки без исходного адреса; key и clock передаёт серверный
 * владелец.
 */
export const signClientSource = ({
  source,
  method,
  pathname,
  key,
  now,
}: SourceRequest & Readonly<{ source: string; key: string; now: number }>) => {
  const digest = createHash("sha256").update(source).digest("hex");
  const signature = createHmac("sha256", Buffer.from(key, "hex"))
    .update(encodeSourceAssertion({ method, pathname, digest, issuedAt: now }))
    .digest("base64url");
  return {
    [sourceHeaders.digest]: digest,
    [sourceHeaders.issuedAt]: String(now),
    [sourceHeaders.signature]: signature,
  };
};
