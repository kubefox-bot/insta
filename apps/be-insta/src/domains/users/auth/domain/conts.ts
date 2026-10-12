export const tokenPolicy = {
  algorithm: "HS256",
  issuer: "insta-api",
  audience: "insta-api",
  use: "access",
  useClaim: "token_use",
  secretBytes: 32,
  millisecondsPerSecond: 1000,
} as const;
export const replayEncryption = {
  algorithm: "dir",
  encryption: "A256GCM",
} as const;
