export const storyTransport = {
  requestMs: 90_000,
  forbidden: 403,
  unauthorized: 401,
  invalid: 400,
  unavailable: 503,
  tooLarge: 413,
} as const;
