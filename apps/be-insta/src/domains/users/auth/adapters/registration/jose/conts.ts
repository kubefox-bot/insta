export const registrationCryptoPolicy = {
  otpContext: "insta/registration/otp/v1",
  proofContext: "insta/registration/proof/v1",
  fingerprintContext: "insta/registration/fingerprint/v1",
  mailContext: "insta/registration/mail/v1",
  audience: "insta-registration-setup",
  use: "registration_setup",
} as const;
