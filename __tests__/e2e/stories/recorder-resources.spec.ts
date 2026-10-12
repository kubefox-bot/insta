import { storyWireLimits } from "@insta/contracts/stories";
import { expect, test } from "@playwright/test";
import type {} from "../../fixtures/recorder/browser";
import { launchWithSyntheticMedia } from "../../fixtures/recorder/launch";

test.use({
  permissions: ["camera", "microphone"],
  launchOptions: launchWithSyntheticMedia,
});

test.beforeEach(async ({ page }) => {
  const bundle = await Bun.build({
    entrypoints: [
      new URL("../../fixtures/recorder/browser.ts", import.meta.url).pathname,
    ],
    target: "browser",
  });
  if (!bundle.success || bundle.outputs.length !== 1)
    throw new AggregateError(bundle.logs, "Recorder fixture bundle failed");
  const output = bundle.outputs[0];
  if (!output) throw new Error("Recorder fixture output missing");
  await page.route("http://localhost/recorder-fixture", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Owned recorder fixture</title><video muted playsinline autoplay></video>",
    }),
  );
  await page.goto("http://localhost/recorder-fixture");
  await page.addScriptTag({ content: await output.text() });
});

test("STORY-01 fake camera/audio records until the wire limit and releases native resources", async ({
  page,
}) => {
  const observed = await page.evaluate(async (maxDurationMs) => {
    const recorder = window.recorderFixture(maxDurationMs);
    const preview = await recorder.openPreview();
    if (preview.isError()) throw new Error(preview.getError().code);
    const stream = preview.get();
    const video = document.querySelector("video");
    if (!video) throw new Error("Preview missing");
    video.srcObject = stream;
    const stopped = Promise.withResolvers<void>();
    const unsubscribe = recorder.subscribe((state) => {
      if (state.status === "recorded") stopped.resolve();
      if (state.status === "error") stopped.reject(new Error(state.error.code));
    });
    const started = recorder.start();
    if (started.isError()) throw new Error(started.getError().code);
    await stopped.promise;
    const result = await recorder.stop();
    if (result.isError()) throw new Error(result.getError().code);
    const recording = result.get();
    await recorder.dispose();
    await recorder.dispose();
    unsubscribe();
    video.srcObject = null;
    return {
      audioTracks: stream.getAudioTracks().length,
      videoTracks: stream.getVideoTracks().length,
      ended: stream.getTracks().every((track) => track.readyState === "ended"),
      bytes: recording.blob.size,
      mimeType: recording.mimeType,
      blobType: recording.blob.type,
      elapsedMs: recording.elapsedMs,
      muted: video.muted,
      playsInline: video.playsInline,
    };
  }, storyWireLimits.maxDurationMs);
  expect(observed.audioTracks).toBe(1);
  expect(observed.videoTracks).toBe(1);
  expect(observed.bytes).toBeGreaterThan(0);
  expect(observed.mimeType).toContain("video/webm");
  expect(observed.blobType).toBe(observed.mimeType);
  expect(observed.elapsedMs).toBeGreaterThanOrEqual(15000);
  expect(observed.elapsedMs).toBeLessThan(17000);
  expect(observed.ended).toBe(true);
  expect(observed.muted).toBe(true);
  expect(observed.playsInline).toBe(true);
});

test("STORY-01 native dispose during recording waits for final stop and ends audio/video tracks", async ({
  page,
}) => {
  const observed = await page.evaluate(async () => {
    const recorder = window.recorderFixture(15000);
    const preview = await recorder.openPreview();
    if (preview.isError()) throw new Error(preview.getError().code);
    const stream = preview.get();
    const started = recorder.start();
    if (started.isError()) throw new Error(started.getError().code);
    const firstStop = recorder.stop();
    const disposal = recorder.dispose();
    const secondStop = recorder.stop();
    const first = await firstStop;
    const second = await secondStop;
    await disposal;
    if (first.isError() || second.isError()) throw new Error("Stop failed");
    return {
      sameBlob: first.get().blob === second.get().blob,
      ended: stream.getTracks().every((track) => track.readyState === "ended"),
    };
  });
  expect(observed.sameBlob).toBe(true);
  expect(observed.ended).toBe(true);
});

test("synthetic recording disposal coalesces repeated cleanup and leaves both tracks ended", async ({
  page,
}) => {
  const observed = await page.evaluate(async () => {
    const recorder = window.recorderFixture(15000);
    const preview = await recorder.openPreview();
    if (preview.isError()) throw new Error(preview.getError().code);
    const stream = preview.get();
    const tracks = stream.getTracks();
    const stopCalls = tracks.map(() => 0);
    tracks.forEach((track, index) => {
      const stop = track.stop.bind(track);
      track.stop = () => {
        stopCalls[index] = (stopCalls[index] ?? 0) + 1;
        stop();
      };
    });
    const result = recorder.start();
    if (result.isError()) throw new Error(result.getError().code);
    await Promise.all([recorder.dispose(), recorder.dispose()]);
    return {
      stopCalls,
      ended: tracks.every((track) => track.readyState === "ended"),
    };
  });
  expect(observed.stopCalls).toEqual([1, 1]);
  expect(observed.ended).toBe(true);
});
