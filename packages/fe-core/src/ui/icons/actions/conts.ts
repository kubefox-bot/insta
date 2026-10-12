const clearAndClosePaths = ["m6 6 12 12M6 18 18 6"] as const;

export const actionPaths = {
  search: ["M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z", "m15 15 6 6"],
  clear: clearAndClosePaths,
  close: clearAndClosePaths,
  send: ["m22 2-7 20-4-9-9-4 20-7Z", "M22 2 11 13"],
  camera: [
    "M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z",
    "M16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  ],
  plus: ["M12 5v14M5 12h14"],
} as const;
