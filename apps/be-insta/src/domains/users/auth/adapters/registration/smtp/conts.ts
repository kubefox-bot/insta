export const smtpPolicy = {
  timeoutMs: 2000,
  from: "Insta <registration@insta.test>",
  messageDomain: "registration.insta.test",
  millisecondsPerMinute: 60000,
} as const;
export const expiryPresentation = {
  locale: "ru",
  timeZone: "UTC",
  options: { dateStyle: "medium", timeStyle: "long" },
} as const;
