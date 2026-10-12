import type { RegistrationErrorCode } from "@insta/contracts/errors";
export type Challenge = Readonly<{
  challengeId: string;
  registrationExpiresAt: number;
  nextSendAt: number;
  errors: number;
  version: string;
  consumed: boolean;
}>;
export type RegistrationError = RegistrationErrorCode;
