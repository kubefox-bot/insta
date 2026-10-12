import { expect, test } from "bun:test";
import { mkdtemp, open, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { z } from "zod";
import { inspectPackets } from "../../apps/be-insta/src/domains/stories/adapters/media/inspect-packets";
import { verifyWebmDecoding } from "../../apps/be-insta/src/domains/stories/adapters/media/webm/decode";
import { inspectWebm } from "../../apps/be-insta/src/domains/stories/adapters/media/webm/inspect";

const bytes = () =>
  Bun.file(
    new URL("../fixtures/media/webm/chrome-vp8.webm", import.meta.url),
  ).bytes();
test("worker rejects impossible container/codec combinations and missing WebM inventory", async () => {
  for (const value of [
    {
      container: "webm",
      videoCodec: "h264",
      audioCodec: "opus",
      durationMs: 1000,
    },
    {
      container: "mp4",
      videoCodec: "vp8",
      audioCodec: "aac",
      durationMs: 1000,
    },
    {
      container: "webm",
      videoCodec: "vp8",
      audioCodec: "opus",
      durationMs: 1000,
    },
  ]) {
    const result = await inspectPackets({
      maxDurationMs: 15000,
      bytes: await bytes(),
      signal: new AbortController().signal,
      createWorker: () =>
        new Worker(
          new URL("../fixtures/media/reply-worker.ts", import.meta.url),
          { workerData: { value } },
        ),
    });
    expect(result.toJSON()).toMatchObject({ error: "MALFORMED_MEDIA" });
  }
});
test("WebM decoder rejects stderr corruption even on exit0 and bounds either output stream", async () => {
  const source = await bytes();
  const inventory = inspectWebm(source);
  for (const [stdout, stderr] of [
    ["", "corrupt frame"],
    ["x".repeat(65537), ""],
    ["", "x".repeat(65537)],
  ] as const) {
    let killed = false;
    const valid = await verifyWebmDecoding({
      bytes: source,
      inventory,
      signal: new AbortController().signal,
      launch: () => ({
        stdout: new Blob([stdout]).stream(),
        stderr: new Blob([stderr]).stream(),
        exited: Promise.resolve(0),
        exitCode: 0,
        kill: () => {
          killed = true;
        },
      }),
    });
    expect(valid).toBe(false);
    if (stdout.length > 65536 || stderr.length > 65536)
      expect(killed).toBe(true);
  }
});
test("WebM abort kills child and awaits actual settlement", async () => {
  const source = await bytes();
  const inventory = inspectWebm(source);
  const abort = new AbortController();
  const settlement = Promise.withResolvers<number>();
  let killed = false;
  let finished = false;
  const operation = verifyWebmDecoding({
    bytes: source,
    inventory,
    signal: abort.signal,
    launch: () => ({
      stdout: new ReadableStream(),
      stderr: new ReadableStream(),
      exited: settlement.promise,
      exitCode: null,
      kill: () => {
        killed = true;
      },
    }),
  }).then((result) => {
    finished = true;
    return result;
  });
  abort.abort();
  await Promise.resolve();
  expect(killed).toBe(true);
  expect(finished).toBe(false);
  settlement.resolve(137);
  expect(await operation).toBe(false);
  expect(finished).toBe(true);
});

test.skipIf(process.platform !== "linux")(
  "actual Linux WebM decoder owns CPU/address-space caps and settles after cancellation",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "insta-decoder-lifetime-"));
    try {
      const fifo = join(directory, "input");
      const createFifo = Bun.spawn(["mkfifo", fifo], { stderr: "pipe" });
      expect(await createFifo.exited).toBe(0);
      await writeFile(
        join(directory, "prlimit"),
        `#!/bin/sh\nexec /usr/bin/prlimit "$@" < '${fifo}'\n`,
        { mode: 0o700 },
      );
      // A writer is owned before launch, so the actual ffprobe cannot reach EOF
      // between caps/exec/argv inspection and cancellation.
      const input = await open(fifo, "r+");
      try {
        const child = Bun.spawn(
          [
            process.execPath,
            new URL(
              "../fixtures/media/native-decoder-lifetime.ts",
              import.meta.url,
            ).pathname,
          ],
          {
            env: Object.fromEntries([["PATH", `${directory}:/usr/bin:/bin`]]),
            stdout: "pipe",
            stderr: "pipe",
          },
        );
        try {
          const [exit, stdout, stderr] = await Promise.all([
            child.exited,
            new Response(child.stdout).text(),
            new Response(child.stderr).text(),
          ]);
          expect({ exit, stderr }).toEqual({ exit: 0, stderr: "" });
          const result = z
            .object({
              limits: z.string(),
              executable: z.string(),
              command: z.string(),
              liveBeforeAbort: z.boolean(),
              output: z.null(),
              exit: z.number(),
              existsAfterSettlement: z.boolean(),
            })
            .parse(JSON.parse(stdout));
          expect(result.executable).toBe("/usr/bin/ffprobe");
          expect(result.limits).toMatch(/Max cpu time\s+8\s+8\s+seconds/);
          expect(result.limits).toMatch(
            /Max address space\s+536870912\s+536870912/,
          );
          expect(result.command).toContain("-threads\u00001\u0000");
          expect(result.command).toContain("-max_alloc\u000067108864\u0000");
          expect(result.command).toContain("-max_pixels\u0000921600\u0000");
          expect(result.liveBeforeAbort).toBe(true);
          expect(result.output).toBeNull();
          expect(result.exit).not.toBe(0);
          expect(result.existsAfterSettlement).toBe(false);
        } finally {
          if (child.exitCode === null) child.kill("SIGTERM");
          await child.exited;
        }
      } finally {
        await input.close();
      }
    } finally {
      await rm(directory, { recursive: true });
    }
    await expect(stat(directory)).rejects.toMatchObject({ code: "ENOENT" });
  },
);
