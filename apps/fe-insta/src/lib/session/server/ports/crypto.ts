import type { RotatingCredentials } from "../types";
export type SessionCrypto = Readonly<{
  sealCredentials: (input: RotatingCredentials) => Promise<string>;
  openCredentials: (ciphertext: string) => Promise<RotatingCredentials>;
  sealRevokeSecret: (secret: string) => Promise<string>;
  openRevokeSecret: (ciphertext: string) => Promise<string>;
}>;
