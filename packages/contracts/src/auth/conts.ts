export const usernameLimits = { min: 3, max: 32 } as const;
export const usernameCharacterClass = "[A-Za-z0-9_]";
export const passwordLimits = {
  minCodePoints: 12,
  maxCodePoints: 128,
} as const;
export const otpInputPolicy = { digits: 6 } as const;
