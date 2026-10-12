export const unauthorizedStatus = 401;
export const rateLimitedStatus = 429;
export const terminalStatuses = {
  validation: 400,
  permission: 403,
  missing: 404,
  conflict: 409,
  semantic: 422,
} as const;
