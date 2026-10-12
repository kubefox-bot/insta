import { expect, test } from "bun:test";
import { createRecorder } from "../src/index";
import { browser } from "./fixtures/browser";
import { failure, value } from "./fixtures/outcome";
import { withReportedErrors } from "./fixtures/reporting";

test.each([0, 100])(
  "stop from recording subscriber at %sms never sends stale recording to siblings",
  async (elapsedMs) => {
    const host = browser();
    const recorder = createRecorder(host.options);
    host.permission.resolve(host.stream);
    await recorder.openPreview();
    const settlements: ReturnType<typeof recorder.stop>[] = [];
    const siblingStates: string[] = [];
    recorder.subscribe((state) => {
      if (state.status === "recording" && state.elapsedMs === elapsedMs)
        settlements.push(recorder.stop());
    });
    recorder.subscribe((state) => siblingStates.push(state.status));
    recorder.start();
    if (elapsedMs > 0) host.tick(elapsedMs);
    expect(siblingStates).toEqual(
      elapsedMs === 0
        ? ["ready", "stopping"]
        : ["ready", "recording", "stopping"],
    );
    expect(host.counts.stops).toBe(1);
    expect(host.stream.active).toBe(true);
    expect(host.callbacks.size).toBe(0);
    host.settle();
    for (const settlement of settlements)
      expect(value(await settlement).blob.size).toBe(5);
    await recorder.dispose();
    for (const track of host.stream.tracks) expect(track.stopCalls).toBe(1);
    expect(host.counts.listeners).toBe(0);
    expect(host.counts.visibility).toBe(0);
    expect(siblingStates.at(-1)).toBe("disposed");
  },
);

test("dispose from recording subscriber sends disposed without stale recording", async () => {
  const host = browser();
  const recorder = createRecorder(host.options);
  host.permission.resolve(host.stream);
  await recorder.openPreview();
  const disposals: Promise<void>[] = [];
  const siblingStates: string[] = [];
  recorder.subscribe((state) => {
    if (state.status === "recording") disposals.push(recorder.dispose());
  });
  recorder.subscribe((state) => siblingStates.push(state.status));
  recorder.start();
  expect(siblingStates).toEqual(["ready", "disposed"]);
  expect(host.counts.stops).toBe(1);
  expect(host.stream.active).toBe(true);
  host.settle();
  await Promise.all(disposals);
  for (const track of host.stream.tracks) expect(track.stopCalls).toBe(1);
  expect(host.counts.listeners).toBe(0);
  expect(host.counts.visibility).toBe(0);
  expect(host.callbacks.size).toBe(0);
  expect(siblingStates).toEqual(["ready", "disposed"]);
});

test("throwing stopping subscriber cannot prevent native stop or sibling notifications", async () => {
  await withReportedErrors(async (errors) => {
    const host = browser();
    const recorder = createRecorder(host.options);
    host.permission.resolve(host.stream);
    await recorder.openPreview();
    const callbackFailure = new Error("stopping callback failed");
    const siblingStates: string[] = [];
    recorder.subscribe((state) => {
      if (state.status === "stopping") throw callbackFailure;
    });
    recorder.subscribe((state) => siblingStates.push(state.status));
    recorder.start();
    const settlements: ReturnType<typeof recorder.stop>[] = [];
    expect(() => settlements.push(recorder.stop())).not.toThrow();
    expect(host.counts.stops).toBe(1);
    host.settle();
    const pending = settlements[0];
    if (!pending) throw new Error("Missing stop result");
    expect(value(await pending).blob.size).toBe(5);
    await recorder.dispose();
    for (const track of host.stream.tracks) expect(track.stopCalls).toBe(1);
    expect(siblingStates).toEqual([
      "ready",
      "recording",
      "stopping",
      "recorded",
      "disposed",
    ]);
    expect(errors).toEqual([callbackFailure]);
  });
});

test.each(["recorded", "error"] as const)(
  "throwing %s subscriber cannot prevent final settlement",
  async (terminal) => {
    await withReportedErrors(async (errors) => {
      const host = browser();
      const recorder = createRecorder(host.options);
      host.permission.resolve(host.stream);
      await recorder.openPreview();
      const callbackFailure = new Error("terminal callback failed");
      const recorderFailure = new Error("native encoder failure");
      const siblingStates: string[] = [];
      recorder.subscribe((state) => {
        if (state.status === terminal) throw callbackFailure;
      });
      recorder.subscribe((state) => siblingStates.push(state.status));
      recorder.start();
      if (terminal === "error") host.events.current?.error(recorderFailure);
      const pending = recorder.stop();
      expect(() => host.settle()).not.toThrow();
      const outcome = await pending;
      if (terminal === "error")
        expect(failure(outcome)).toEqual({
          code: "recorder-failed",
          cause: recorderFailure,
        });
      else expect(value(outcome).blob.size).toBe(5);
      await recorder.dispose();
      for (const track of host.stream.tracks) expect(track.stopCalls).toBe(1);
      expect(host.counts.listeners).toBe(0);
      expect(siblingStates).toContain(terminal);
      expect(errors).toEqual([callbackFailure]);
    });
  },
);

test("throwing elapsed subscriber preserves timer rearm and recording limit", async () => {
  await withReportedErrors(async (errors) => {
    const host = browser();
    const recorder = createRecorder(host.options);
    host.permission.resolve(host.stream);
    await recorder.openPreview();
    const callbackFailure = new Error("elapsed callback failed");
    const siblingElapsed: number[] = [];
    recorder.subscribe((state) => {
      if (state.status === "recording" && state.elapsedMs > 0)
        throw callbackFailure;
    });
    recorder.subscribe((state) => {
      if (state.status === "recording") siblingElapsed.push(state.elapsedMs);
    });
    recorder.start();
    expect(() => host.tick(100)).not.toThrow();
    expect(host.callbacks.size).toBe(1);
    host.tick(15000);
    expect(host.counts.stops).toBe(1);
    host.settle();
    expect(value(await recorder.stop()).elapsedMs).toBe(15000);
    await recorder.dispose();
    expect(siblingElapsed).toEqual([0, 100]);
    expect(errors).toEqual([callbackFailure]);
  });
});
