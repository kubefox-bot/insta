import { expect, test } from "bun:test";
import { createRecorder } from "../src/index";
import { browser } from "./fixtures/browser";
import { failure, value } from "./fixtures/outcome";

test("recording limit follows elapsed time rather than tick count", async () => {
  const host = browser();
  const recorder = createRecorder(host.options);
  const states: string[] = [];
  recorder.subscribe((state) => states.push(state.status));
  host.permission.resolve(host.stream);
  await recorder.openPreview();
  expect(recorder.start().isOk()).toBe(true);
  host.tick(14999);
  expect(host.counts.stops).toBe(0);
  host.tick(15000);
  expect(host.counts.stops).toBe(1);
  host.settle();
  expect(value(await recorder.stop()).elapsedMs).toBe(15000);
  await recorder.dispose();
  expect(states).toEqual([
    "idle",
    "requesting-permission",
    "ready",
    "recording",
    "recording",
    "stopping",
    "recorded",
    "disposed",
  ]);
});

test("hidden page stops a recording without reopening devices", async () => {
  const host = browser();
  const recorder = createRecorder(host.options);
  host.permission.resolve(host.stream);
  await recorder.openPreview();
  recorder.start();
  host.events.hidden?.();
  expect(host.counts.stops).toBe(1);
  host.settle();
  await recorder.dispose();
});

test.each([
  ["NotAllowedError", "permission-denied"],
  ["NotFoundError", "device-unavailable"],
  ["NotReadableError", "device-unavailable"],
  ["UnexpectedError", "device-failed"],
] as const)(
  "permission rejection %s has explicit outcome %s",
  async (name, code) => {
    const host = browser();
    const recorder = createRecorder(host.options);
    host.permission.reject(new DOMException("fixture", name));
    expect(failure(await recorder.openPreview()).code).toBe(code);
    await recorder.dispose();
  },
);

test("invalid transitions and disposed operations never start capture", async () => {
  const host = browser();
  const recorder = createRecorder(host.options);
  expect(failure(recorder.start()).code).toBe("invalid-state");
  expect(failure(await recorder.stop()).code).toBe("invalid-state");
  await recorder.dispose();
  expect(failure(await recorder.openPreview()).code).toBe("disposed");
  expect(failure(recorder.start()).code).toBe("disposed");
  expect(host.counts.starts).toBe(0);
});

test("public SSR import and construction do not read navigator", async () => {
  const source = `Object.defineProperty(globalThis, 'navigator', { get() { throw new Error('navigator read during SSR'); } }); const {createRecorder} = await import('./packages/media-recorder/src/index.ts'); const recorder = createRecorder({maxDurationMs:15000}); await recorder.dispose();`;
  const process = Bun.spawn([Bun.which("bun") ?? "bun", "-e", source], {
    stdout: "pipe",
    stderr: "pipe",
    cwd: new URL("../../../", import.meta.url).pathname,
  });
  const output = await new Response(process.stderr).text();
  expect(output).toBe("");
  expect(await process.exited).toBe(0);
});
