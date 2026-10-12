import { expect, test } from "bun:test";
import { createRecorder } from "../src/index";
import { browser } from "./fixtures/browser";
import { failure, value } from "./fixtures/outcome";

test("late permission after disposal releases every owned track exactly once", async () => {
  const host = browser();
  const recorder = createRecorder(host.options);
  const pending = recorder.openPreview();
  const disposal = recorder.dispose();
  let settled = false;
  disposal.then(() => {
    settled = true;
  });
  await Promise.resolve();
  expect(settled).toBe(false);
  host.permission.resolve(host.stream);
  expect(failure(await pending).code).toBe("disposed");
  await disposal;
  await recorder.dispose();
  for (const track of host.stream.tracks) expect(track.stopCalls).toBe(1);
});

test("stop waits for final data, shares settlement and releases tracks/listeners", async () => {
  const host = browser();
  const recorder = createRecorder(host.options);
  host.permission.resolve(host.stream);
  await recorder.openPreview();
  recorder.start();
  host.events.current?.data(new Blob(["first"]));
  host.time.now = 2500;
  const first = recorder.stop();
  const second = recorder.stop();
  const disposal = recorder.dispose();
  expect(host.stream.active).toBe(true);
  expect(host.counts.stops).toBe(1);
  host.settle();
  const result = value(await first);
  expect(result.blob.size).toBe(10);
  expect(await result.blob.text()).toBe("firstfinal");
  expect(result.mimeType).toBe("video/webm;codecs=vp8,opus");
  expect(result.elapsedMs).toBe(2500);
  expect(value(await second)).toBe(result);
  await disposal;
  for (const track of host.stream.tracks) expect(track.stopCalls).toBe(1);
  expect(host.counts.listeners).toBe(0);
  expect(host.counts.visibility).toBe(0);
  expect(host.callbacks.size).toBe(0);
});

test("recorder error waits for stop settlement before releasing resources", async () => {
  const host = browser();
  const recorder = createRecorder(host.options);
  host.permission.resolve(host.stream);
  await recorder.openPreview();
  recorder.start();
  host.events.current?.error(new Error("encoding failed"));
  const pending = recorder.stop();
  expect(host.stream.active).toBe(true);
  host.settle();
  expect(failure(await pending).code).toBe("recorder-failed");
  expect(host.stream.active).toBe(false);
  await recorder.dispose();
});

test("disposal from a recording subscriber cannot install resources after stop", async () => {
  const host = browser();
  const recorder = createRecorder(host.options);
  host.permission.resolve(host.stream);
  await recorder.openPreview();
  const disposals: Promise<void>[] = [];
  recorder.subscribe((state) => {
    if (state.status === "recording") disposals.push(recorder.dispose());
  });
  recorder.start();
  expect(host.callbacks.size).toBe(0);
  expect(host.counts.visibility).toBe(0);
  host.settle();
  await Promise.all(disposals);
  expect(host.counts.visibility).toBe(0);
});

test("disposal from an elapsed update cannot reschedule a timer", async () => {
  const host = browser();
  const recorder = createRecorder(host.options);
  host.permission.resolve(host.stream);
  await recorder.openPreview();
  const disposals: Promise<void>[] = [];
  recorder.subscribe((state) => {
    if (state.status === "recording" && state.elapsedMs > 0)
      disposals.push(recorder.dispose());
  });
  recorder.start();
  host.tick(100);
  expect(host.callbacks.size).toBe(0);
  host.settle();
  await Promise.all(disposals);
});

test("synchronous stop failure ends capture but waits for recorder settlement", async () => {
  const host = browser();
  const factory = host.options.recorderFactory;
  const recorder = createRecorder({
    ...host.options,
    recorderFactory: {
      ...factory,
      create: (stream, mimeType) => ({
        ...factory.create(stream, mimeType),
        stop: () => {
          throw new Error("stop effect unknown");
        },
      }),
    },
  });
  host.permission.resolve(host.stream);
  await recorder.openPreview();
  recorder.start();
  const pending = recorder.stop();
  expect(host.stream.active).toBe(false);
  expect(host.counts.listeners).toBe(1);
  host.settle();
  expect(failure(await pending).code).toBe("recorder-failed");
  await recorder.dispose();
  for (const track of host.stream.tracks) expect(track.stopCalls).toBe(1);
});

test("dispose during permission notification still waits for the pending device", async () => {
  const host = browser();
  const recorder = createRecorder(host.options);
  const disposals: Promise<void>[] = [];
  recorder.subscribe((state) => {
    if (state.status === "requesting-permission")
      disposals.push(recorder.dispose());
  });
  const pending = recorder.openPreview();
  let disposed = false;
  disposals[0]?.then(() => {
    disposed = true;
  });
  await Promise.resolve();
  await Promise.resolve();
  expect(disposed).toBe(false);
  host.permission.resolve(host.stream);
  expect(failure(await pending).code).toBe("disposed");
  await Promise.all(disposals);
  for (const track of host.stream.tracks) expect(track.stopCalls).toBe(1);
});
