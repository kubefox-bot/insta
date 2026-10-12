import type { Result } from "@bloodyowl/boxed";
import type { UserId } from "../../../domain/types";
import type { RegistrationError } from "../../domain/registration/types";
export type RegistrationCrypto = Readonly<{
  challengeId: (email: string) => string;
  code: () => string;
  secret: () => string;
  digest: (value: string) => string;
  codeDigest: (
    input: Readonly<{ challengeId: string; version: string; code: string }>,
  ) => string;
  sealMail: (
    input: Readonly<{ email: string; code: string }>,
  ) => Promise<string>;
  openMail: (
    ciphertext: string,
  ) => Promise<Readonly<{ email: string; code: string }>>;
  issueProof: (
    input: Readonly<{
      userId: UserId;
      secret: string;
      expiresAt: number;
      now: number;
    }>,
  ) => Promise<string>;
  verifyProof: (
    input: Readonly<{ proof: string; now: number }>,
  ) => Promise<
    Result<
      Readonly<{ userId: UserId; secret: string; expiresAt: number }>,
      RegistrationError
    >
  >;
}>;
