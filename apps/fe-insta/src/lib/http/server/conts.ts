export const requestLimitStatus = { headers: 431, json: 413 } as const;
export const safeHttpMethods = ["GET", "HEAD", "OPTIONS"] as const;
export const cookieOriginForbiddenStatus = 403;
export const serverErrorStatus = 500;
export const requestLimitModes = {
  generic: "headers_and_json",
  owningBody: "headers_only",
} as const;
export const defaultRequestLimitOptions = {
  mode: requestLimitModes.generic,
} as const;
