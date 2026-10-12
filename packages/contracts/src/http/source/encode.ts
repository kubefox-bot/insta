import { sourceAssertionPolicy } from "./conts";
import type { SourceRequest } from "./types";
// Canonical field order and protocol version are part of the signed wire contract.
/** Сериализует поля source assertion в каноническом порядке вместе с версией протокола; возвращает материал для подписи, не вычисляя саму подпись. */
export const encodeSourceAssertion = ({
  method,
  pathname,
  digest,
  issuedAt,
}: SourceRequest & Readonly<{ digest: string; issuedAt: number }>) =>
  JSON.stringify([
    sourceAssertionPolicy.version,
    method,
    pathname,
    digest,
    issuedAt,
  ]);
