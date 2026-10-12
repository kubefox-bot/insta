import type { Recorder } from "@insta/media-recorder";
import { createRecorder } from "@insta/media-recorder";

declare global {
  interface Window {
    recorderFixture: (maxDurationMs: number) => Recorder;
  }
}
// Test-only bundle injected into an owned secure-origin page; no application route or fault endpoint.
window.recorderFixture = (maxDurationMs) => createRecorder({ maxDurationMs });
