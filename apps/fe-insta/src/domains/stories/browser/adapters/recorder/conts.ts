export const storyCaptureOptions = {
  mimeCandidates: ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus"],
  constraints: {
    audio: true,
    video: {
      width: { ideal: 1280, max: 1280 },
      height: { ideal: 720, max: 720 },
      frameRate: { ideal: 30, max: 30 },
    },
  },
} as const;
