import { expect, test } from "bun:test";
import { createNativeStoryRecorder } from "../../../apps/fe-insta/src/domains/stories/browser/adapters/recorder/create";
import { browser } from "../../../packages/media-recorder/__tests__/fixtures/browser";
import { fixture } from "../../../packages/media-recorder/__tests__/webm/fixture";

test.each(["video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus"])(
  "Stories selects%s with bounded AV capture and stops at14800ms",
  async (supportedMime) => {
    const native = browser();
    const queried: string[] = [];
    const constraints: MediaStreamConstraints[] = [];
    const recorder = createNativeStoryRecorder(
      {
        maxDurationMs: 15000,
        lifetimeMs: 86400000,
        maxFileBytes: 20971520,
        captureSafetyMarginMs: 200,
      },
      {
        ...native.options,
        mediaDevices: {
          getUserMedia: async (input) => {
            if (input) constraints.push(input);
            return native.stream;
          },
        },
        recorderFactory: {
          isTypeSupported: (mime) => {
            queried.push(mime);
            return mime === supportedMime;
          },
          create: (stream, mime) => ({
            ...native.options.recorderFactory.create(stream, mime),
            mimeType: mime,
          }),
        },
      },
    );
    expect((await recorder.openPreview()).isOk()).toBe(true);
    expect(queried).toEqual(
      supportedMime.includes("vp8")
        ? ["video/webm;codecs=vp8,opus"]
        : ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus"],
    );
    expect(constraints).toEqual([
      {
        audio: true,
        video: {
          width: { ideal: 1280, max: 1280 },
          height: { ideal: 720, max: 720 },
          frameRate: { ideal: 30, max: 30 },
        },
      },
    ]);
    recorder.start();
    native.tick(14799);
    expect(native.counts.stops).toBe(0);
    native.tick(14800);
    expect(native.counts.stops).toBe(1);
    native.events.current?.data(fixture().blob);
    native.events.current?.stop();
    const result = await recorder.stop();
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.get().mimeType).toBe(supportedMime);
      expect(result.get().elapsedMs).toBe(14800);
    }
    await recorder.dispose();
  },
);

test("native adapter repairs final WebM after final data and keeps real monotonic elapsed", async () => {
  const native = browser();
  const recorder = createNativeStoryRecorder(
    {
      maxDurationMs: 15000,
      lifetimeMs: 86400000,
      maxFileBytes: 20971520,
      captureSafetyMarginMs: 200,
    },
    native.options,
  );
  native.permission.resolve(native.stream);
  const opened = await recorder.openPreview();
  expect(opened.isOk()).toBe(true);
  recorder.start();
  native.time.now = 14912;
  const stopping = recorder.stop();
  const source = fixture();
  native.events.current?.data(source.blob);
  native.events.current?.stop();
  const result = await stopping;
  expect(result.isOk()).toBe(true);
  if (result.isOk()) {
    expect(result.get().elapsedMs).toBe(14912);
    expect(result.get().blob.size).toBe(source.blob.size + 11);
    expect(result.get().mimeType).toBe("video/webm;codecs=vp8,opus");
  }
  await recorder.dispose();
  expect(native.stream.tracks.map((track) => track.stopCalls)).toEqual([1, 1]);
});

test.each([
  [20971509, true],
  [20971520, false],
] as const)(
  "repair of%s bytes accepts final Blob iff it fits20MiB",
  async (inputSize, accepted) => {
    const native = browser();
    const recorder = createNativeStoryRecorder(
      {
        maxDurationMs: 15000,
        lifetimeMs: 86400000,
        maxFileBytes: 20971520,
        captureSafetyMarginMs: 200,
      },
      native.options,
    );
    native.permission.resolve(native.stream);
    await recorder.openPreview();
    recorder.start();
    native.time.now = 900;
    const stopping = recorder.stop();
    const original = fixture().bytes;
    const paddingSize = inputSize - original.length - 5;
    const size = new Uint8Array([
      0x10 + Math.floor(paddingSize / 16777216),
      (paddingSize >>> 16) & 255,
      (paddingSize >>> 8) & 255,
      paddingSize & 255,
    ]);
    const blob = new Blob([
      original,
      new Uint8Array([0xec]),
      size,
      new Uint8Array(paddingSize),
    ]);
    expect(blob.size).toBe(inputSize);
    native.events.current?.data(blob);
    native.events.current?.stop();
    const result = await stopping;
    expect(result.isOk()).toBe(accepted);
    if (result.isOk()) expect(result.get().blob.size).toBe(20971520);
    if (result.isError())
      expect(result.getError().code).toBe("finalization-failed");
    await recorder.dispose();
  },
);

test("reduced authoritative policy stops capture 200ms before its limit", async () => {
  const native = browser();
  const recorder = createNativeStoryRecorder(
    {
      maxDurationMs: 10000,
      lifetimeMs: 86400000,
      maxFileBytes: 20971520,
      captureSafetyMarginMs: 200,
    },
    native.options,
  );
  native.permission.resolve(native.stream);
  await recorder.openPreview();
  recorder.start();
  native.tick(9799);
  expect(native.counts.stops).toBe(0);
  native.tick(9800);
  expect(native.counts.stops).toBe(1);
  native.events.current?.data(fixture().blob);
  native.events.current?.stop();
  expect((await recorder.stop()).isOk()).toBe(true);
  await recorder.dispose();
});
