import { expect, test } from "bun:test";
import { Result } from "@bloodyowl/boxed";
import {
  createRecorder,
  type RecorderError,
  type Recording,
} from "../src/index";
import { browser } from "./fixtures/browser";
import { failure, value } from "./fixtures/outcome";

test("stop awaits one finalization of all final chunks and returns its recording", async () => {
  const host = browser();
  const finalization =
    Promise.withResolvers<Result<Recording, RecorderError>>();
  const inputs: Recording[] = [];
  const recorder = createRecorder({
    ...host.options,
    finalizeRecording: (recording) => {
      inputs.push(recording);
      return finalization.promise;
    },
  });
  host.permission.resolve(host.stream);
  await recorder.openPreview();
  recorder.start();
  host.events.current?.data(new Blob(["first"]));
  host.time.now = 15123;
  const first = recorder.stop();
  expect(recorder.stop()).toBe(first);
  expect(inputs).toHaveLength(0);
  await Promise.resolve();
  host.settle();
  const input = inputs[0];
  expect(input).toBeDefined();
  if (!input) throw new Error("finalizer was not called");
  expect(await input.blob.text()).toBe("firstfinal");
  expect(input.elapsedMs).toBe(15123);
  expect(host.stream.active).toBe(false);
  expect(host.counts.listeners).toBe(0);
  expect(host.counts.visibility).toBe(0);
  expect(host.callbacks.size).toBe(0);
  let settled = false;
  first.then(() => {
    settled = true;
  });
  await Promise.resolve();
  expect(settled).toBe(false);
  const output = {
    ...input,
    blob: new Blob(["repaired"], { type: input.mimeType }),
  };
  finalization.resolve(Result.Ok(output));
  expect(value(await first)).toBe(output);
  expect(inputs).toHaveLength(1);
  await recorder.dispose();
});

test("dispose awaits finalization and ignores late recorded state", async () => {
  const host = browser();
  const gate = Promise.withResolvers<Result<Recording, RecorderError>>();
  const recorder = createRecorder({
    ...host.options,
    finalizeRecording: () => gate.promise,
  });
  const states: string[] = [];
  recorder.subscribe((state) => states.push(state.status));
  host.permission.resolve(host.stream);
  await recorder.openPreview();
  recorder.start();
  recorder.stop();
  host.settle();
  const disposal = recorder.dispose();
  let disposed = false;
  disposal.then(() => {
    disposed = true;
  });
  await Promise.resolve();
  await Promise.resolve();
  expect(disposed).toBe(false);
  gate.resolve(
    Result.Ok({
      blob: new Blob(["fixed"]),
      mimeType: "video/webm",
      elapsedMs: 1,
    }),
  );
  await disposal;
  expect(states.at(-1)).toBe("disposed");
  expect(states).not.toContain("recorded");
  for (const track of host.stream.tracks) expect(track.stopCalls).toBe(1);
});

test.each(["expected", "rejected"] as const)(
  "finalizer %s failure never returns original blob",
  async (mode) => {
    const host = browser();
    const cause = new Error("metadata failed");
    const recorder = createRecorder({
      ...host.options,
      finalizeRecording: async () => {
        if (mode === "rejected") throw cause;
        return Result.Error({ code: "finalization-failed" as const, cause });
      },
    });
    host.permission.resolve(host.stream);
    await recorder.openPreview();
    recorder.start();
    const pending = recorder.stop();
    host.settle();
    expect(failure(await pending)).toEqual({
      code: "finalization-failed",
      cause,
    });
    await recorder.dispose();
  },
);

test("finalization receives the measured clock delta without clamping", async () => {
  const host = browser();
  const recorder = createRecorder({
    ...host.options,
    finalizeRecording: async (recording) => Result.Ok(recording),
  });
  host.permission.resolve(host.stream);
  await recorder.openPreview();
  host.time.now = 10;
  recorder.start();
  host.time.now = 5;
  const pending = recorder.stop();
  host.settle();
  expect(value(await pending).elapsedMs).toBe(-5);
  await recorder.dispose();
});
