export const defaultMimeCandidates = [
  "video/webm;codecs=vp8,opus",
  "video/webm;codecs=vp9,opus",
  "video/webm",
] as const;
export const elapsedUpdateMs = 100;
export const defaultConstraints = { audio: true, video: true } as const;
export const permissionErrorCodes = {
  notallowederror: "permission-denied",
  securityerror: "permission-denied",
  notfounderror: "device-unavailable",
  notreadableerror: "device-unavailable",
  overconstrainederror: "device-unavailable",
} as const;
