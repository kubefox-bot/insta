import { expect, test } from "bun:test";
import { createMediaInspector } from "../../apps/be-insta/src/domains/stories/server/index";

const source = (name: string) =>
  Bun.file(new URL(`../fixtures/media/${name}`, import.meta.url)).stream();
test.each(["chrome", "msedge"])(
  "native %s MP4 validates actual H264/AAC packet ends",
  async (channel) => {
    const inspector = createMediaInspector();
    try {
      const result = await inspector.inspect({
        source: source(`${channel}-valid.mp4`),
        maxBytes: 20971520,
        maxDurationMs: 15000,
        deadline: Date.now() + 10000,
      });
      expect(result.isOk()).toBe(true);
      if (result.isError()) throw Error(result.getError());
      expect(result.get()).toMatchObject({
        container: "mp4",
        videoCodec: "h264",
        audioCodec: "aac",
      });
      expect(result.get().durationMs).toBeGreaterThan(1000);
      expect(result.get().durationMs).toBeLessThan(15000);
    } finally {
      await inspector.close();
    }
  },
);
test.each(["chrome", "msedge"])(
  "native %s >15s MP4 is rejected from actual packet timeline",
  async (channel) => {
    const inspector = createMediaInspector();
    try {
      expect(
        (
          await inspector.inspect({
            source: source(`${channel}-long.mp4`),
            maxBytes: 20971520,
            maxDurationMs: 15000,
            deadline: Date.now() + 10000,
          })
        ).toJSON(),
      ).toMatchObject({ tag: "Error", error: "TOO_LONG" });
    } finally {
      await inspector.close();
    }
  },
);
test("truncated boxes, spoofed MIME and actual >20MiB stream cannot validate", async () => {
  const inspector = createMediaInspector();
  try {
    const bytes = new Uint8Array(
      await Bun.file(
        new URL("../fixtures/media/chrome-valid.mp4", import.meta.url),
      ).arrayBuffer(),
    );
    for (const blob of [
      new Blob([bytes.slice(0, -17)], { type: "video/mp4" }),
      new Blob([bytes.slice(0, bytes.length / 2)]),
      new Blob(["not media"], { type: "video/mp4" }),
    ])
      expect(
        (
          await inspector.inspect({
            source: blob.stream(),
            maxBytes: 20971520,
            maxDurationMs: 15000,
            deadline: Date.now() + 10000,
          })
        ).isError(),
      ).toBe(true);
    expect(
      (
        await inspector.inspect({
          source: new Blob([new Uint8Array(20971521)]).stream(),
          maxBytes: 20971520,
          maxDurationMs: 15000,
          deadline: Date.now() + 10000,
        })
      ).toJSON(),
    ).toMatchObject({ tag: "Error", error: "FILE_TOO_LARGE" });
  } finally {
    await inspector.close();
  }
});
test("deadline cancels stalled source and pool rejects third active inspection", async () => {
  const inspector = createMediaInspector();
  let canceled = 0;
  const stalled = () =>
    new ReadableStream<Uint8Array>({
      cancel() {
        canceled++;
      },
    });
  try {
    const first = inspector.inspect({
      source: stalled(),
      maxBytes: 20971520,
      maxDurationMs: 15000,
      deadline: Date.now() + 100,
    });
    const second = inspector.inspect({
      source: stalled(),
      maxBytes: 20971520,
      maxDurationMs: 15000,
      deadline: Date.now() + 100,
    });
    expect(
      (
        await inspector.inspect({
          source: source("chrome-valid.mp4"),
          maxBytes: 20971520,
          maxDurationMs: 15000,
          deadline: Date.now() + 1000,
        })
      ).toJSON(),
    ).toMatchObject({ tag: "Error", error: "BUSY" });
    expect((await first).toJSON()).toMatchObject({
      tag: "Error",
      error: "DEADLINE",
    });
    expect((await second).toJSON()).toMatchObject({
      tag: "Error",
      error: "DEADLINE",
    });
    expect(canceled).toBe(2);
  } finally {
    await inspector.close();
  }
});

test("actual malformed H264 sample and forged sample-entry codec cannot validate", async () => {
  const inspector = createMediaInspector();
  try {
    const original = new Uint8Array(
      await Bun.file(
        new URL("../fixtures/media/chrome-valid.mp4", import.meta.url),
      ).arrayBuffer(),
    );
    const payload = original.slice();
    payload.fill(255, 2100, 3000);
    const codec = original.slice();
    const index = Buffer.from(codec).indexOf("avc1", 100);
    if (index < 0) throw Error("Missing native sample entry");
    codec.set(new TextEncoder().encode("vp09"), index);
    for (const bytes of [payload, codec])
      expect(
        (
          await inspector.inspect({
            source: new Blob([bytes]).stream(),
            maxBytes: 20971520,
            maxDurationMs: 15000,
            deadline: Date.now() + 10000,
          })
        ).isError(),
      ).toBe(true);
  } finally {
    await inspector.close();
  }
});
test("close cancels active inspection, waits for settlement, and prevents new claims", async () => {
  const inspector = createMediaInspector();
  let canceled = false;
  const pending = inspector.inspect({
    source: new ReadableStream<Uint8Array>({
      cancel() {
        canceled = true;
      },
    }),
    maxBytes: 20971520,
    maxDurationMs: 15000,
    deadline: Date.now() + 10000,
  });
  await inspector.close();
  expect(canceled).toBe(true);
  expect((await pending).isError()).toBe(true);
  expect(
    (
      await inspector.inspect({
        source: source("chrome-valid.mp4"),
        maxBytes: 20971520,
        maxDurationMs: 15000,
        deadline: Date.now() + 10000,
      })
    ).toJSON(),
  ).toMatchObject({ tag: "Error", error: "INSPECTOR_UNAVAILABLE" });
});

test("explicit packet timeline accepts exactly15000ms and rejects15001ms; missing final duration stays invalid", async () => {
  const { withFinalVideoDuration } = await import("../fixtures/media/modify");
  const original = new Uint8Array(
    await Bun.file(
      new URL("../fixtures/media/chrome-valid.mp4", import.meta.url),
    ).arrayBuffer(),
  );
  const inspector = createMediaInspector();
  try {
    const inspect = (bytes: Uint8Array<ArrayBuffer>) =>
      inspector.inspect({
        source: new Blob([bytes]).stream(),
        maxBytes: 20971520,
        maxDurationMs: 15000,
        deadline: Date.now() + 10000,
      });
    const valid = await inspect(withFinalVideoDuration(original, 15000));
    expect(valid.isOk()).toBe(true);
    if (valid.isOk()) expect(valid.get().durationMs).toBe(15000);
    expect(
      (await inspect(withFinalVideoDuration(original, 15001))).toJSON(),
    ).toMatchObject({ tag: "Error", error: "TOO_LONG" });
    const zero = withFinalVideoDuration(original, 15000);
    const trun = Buffer.from(zero).indexOf("trun");
    const view = new DataView(zero.buffer);
    view.setUint32(trun + 20 + (view.getUint32(trun + 8) - 1) * 8, 0);
    expect((await inspect(zero)).isError()).toBe(true);
  } finally {
    await inspector.close();
  }
});

test("leading empty ISO edit cannot hide a playback timeline above15s", async () => {
  const { withLeadingEmptyEdit } = await import("../fixtures/media/edit-list");
  const bytes = new Uint8Array(
    await Bun.file(
      new URL("../fixtures/media/chrome-valid.mp4", import.meta.url),
    ).arrayBuffer(),
  );
  const inspector = createMediaInspector();
  try {
    const result = await inspector.inspect({
      source: new Blob([withLeadingEmptyEdit(bytes)]).stream(),
      maxBytes: 20971520,
      maxDurationMs: 15000,
      deadline: Date.now() + 10000,
    });
    expect(result.isError()).toBe(true);
  } finally {
    await inspector.close();
  }
});

test("one non-VCL sample among valid native pictures cannot silently partially decode", async () => {
  const { withNonVclVideoSample } = await import("../fixtures/media/modify");
  const bytes = new Uint8Array(
    await Bun.file(
      new URL("../fixtures/media/chrome-valid.mp4", import.meta.url),
    ).arrayBuffer(),
  );
  const inspector = createMediaInspector();
  try {
    const result = await inspector.inspect({
      source: new Blob([withNonVclVideoSample(bytes)]).stream(),
      maxBytes: 20971520,
      maxDurationMs: 15000,
      deadline: Date.now() + 10000,
    });
    expect(result.toJSON()).toMatchObject({
      tag: "Error",
      error: "MALFORMED_MEDIA",
    });
  } finally {
    await inspector.close();
  }
});

test("huge SPS geometry hidden behind640x480 container dimensions is rejected", async () => {
  const { withHugeSps } = await import("../fixtures/media/sps");
  const bytes = new Uint8Array(
    await Bun.file(
      new URL("../fixtures/media/chrome-valid.mp4", import.meta.url),
    ).arrayBuffer(),
  );
  const inspector = createMediaInspector();
  try {
    const result = await inspector.inspect({
      source: new Blob([withHugeSps(bytes)]).stream(),
      maxBytes: 20971520,
      maxDurationMs: 15000,
      deadline: Date.now() + 10000,
    });
    expect(result.toJSON()).toMatchObject({
      tag: "Error",
      error: "MALFORMED_MEDIA",
    });
  } finally {
    await inspector.close();
  }
});
