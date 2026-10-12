export const timeoutFailure = "UNREAD_LIST_TIMEOUT";
export const unreadHttpStatuses = {
  unauthorized: 401,
  forbidden: 403,
  requestTimeout: 408,
  rateLimited: 429,
  internalError: 500,
  badGateway: 502,
  unavailable: 503,
  gatewayTimeout: 504,
} as const;
export const retryableUnreadStatuses: readonly number[] = [
  unreadHttpStatuses.requestTimeout,
  unreadHttpStatuses.rateLimited,
  unreadHttpStatuses.internalError,
  unreadHttpStatuses.badGateway,
  unreadHttpStatuses.unavailable,
  unreadHttpStatuses.gatewayTimeout,
];
