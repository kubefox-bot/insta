export const nativePolicy = {
  readyTimeoutMs: 10000,
  readyIntervalMs: 100,
  viewport: "1280,720",
  executables: {
    chrome: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    msedge: "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  },
} as const;
