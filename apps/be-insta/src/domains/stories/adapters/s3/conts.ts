export const storagePolicy = {
  operationTimeoutMs: 90000,
  requestSignatureSeconds: 90,
  maxPlaybackSeconds: 300,
  millisecondsPerSecond: 1000,
  maxPageSize: 100,
  contentType: "video/mp4",
  webmContentType: "video/webm",
  keyPattern: /^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_.-]+)*$/,
} as const;
export const playbackSignature = {
  dateParameter: "X-Amz-Date",
  expiresParameter: "X-Amz-Expires",
  datePattern: /^\d{8}T\d{6}Z$/,
  secondsPattern: /^[1-9]\d*$/,
} as const;
export const storageStatus = {
  notFound: 404,
  preconditionFailed: 412,
  conflict: 409,
} as const;
export const storageFailures = {
  signature: "Invalid playback signature",
  put: "Stories storage PUT failed; outcome may be unknown",
  read: "Stories storage GET failed",
  remove: "Stories storage DELETE failed; outcome may be unknown",
  list: "Stories storage LIST failed",
} as const;
