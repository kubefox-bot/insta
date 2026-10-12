import { otpInputPolicy } from "@insta/contracts/auth";
import { RegistrationErrorCode } from "@insta/contracts/errors";
export const otpPolicy = {
  digits: otpInputPolicy.digits,
  errors: 5,
  resendCooldownMs: 60000,
} as const;
export const activationErrors = {
  emailExists: RegistrationErrorCode.RegistrationProofInvalid,
  activeUser: RegistrationErrorCode.RegistrationProofInvalid,
  invalidProof: RegistrationErrorCode.RegistrationProofInvalid,
  registrationExpired: RegistrationErrorCode.RegistrationExpired,
  usernameTaken: RegistrationErrorCode.UsernameTaken,
  conflict: RegistrationErrorCode.RegistrationConflict,
  invalidSession: RegistrationErrorCode.RegistrationProofInvalid,
} as const satisfies Record<
  import("../../../domain/types").PersistenceError,
  import("./types").RegistrationError
>;
