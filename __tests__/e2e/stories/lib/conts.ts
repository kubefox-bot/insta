export const publicationVisibility = {
  timeoutMs: 32_000,
  intervalMs: 2_000,
} as const;
export const publicationMedia = {
  mp4: {
    file: "chrome-valid.mp4",
    name: "synthetic.mp4",
    mimeType: "video/mp4",
  },
  webm: {
    file: "webm/fresh/chrome-vp9-streaming-short.webm",
    name: "synthetic.webm",
    mimeType: "video/webm",
  },
} as const;
