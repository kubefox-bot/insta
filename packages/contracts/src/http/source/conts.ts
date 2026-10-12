export const sourceHeaders = {
  digest: "x-insta-client-source",
  issuedAt: "x-insta-source-issued-at",
  signature: "x-insta-source-signature",
} as const;
export const mappedIpv4Prefix = "::ffff:";
export const sourceAssertionPolicy = {
  version: 1,
  maximumAgeMs: 60_000,
  futureSkewMs: 5_000,
} as const;
