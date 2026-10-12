import { expect, test } from "bun:test";
import { createMediaInspector } from "../../apps/be-insta/src/domains/stories/server/index";
import freshProvenance from "../fixtures/media/webm/fresh/provenance.json";

const inspect = async (name: string) => {
  const inspector = createMediaInspector();
  try {
    return await inspector.inspect({
      source: Bun.file(
        new URL(`../fixtures/media/webm/${name}`, import.meta.url),
      ).stream(),
      maxBytes: 20971520,
      maxDurationMs: 15000,
      deadline: Date.now() + 10000,
    });
  } finally {
    await inspector.close();
  }
};
test.each(["chrome", "msedge"])(
  "native %s WebM validates VP8 and VP9 with terminal packet duration zero",
  async (browser) => {
    for (const codec of ["vp8", "vp9"]) {
      const result = await inspect(`${browser}-${codec}.webm`);
      expect(result.toJSON()).toMatchObject({
        tag: "Ok",
        value: { container: "webm", videoCodec: codec, audioCodec: "opus" },
      });
      if (result.isOk()) expect(result.get().durationMs).toBeLessThan(15000);
    }
  },
);
test("long video with short audio and forged1s metadata exceeds the real limit", async () => {
  expect((await inspect("long-video-forged.webm")).toJSON()).toMatchObject({
    tag: "Error",
    error: "TOO_LONG",
  });
});

test("14.8s native WebM fits the strict horizon and compact64KiB decoder output budget", async () => {
  const result = await inspect("chrome-margin.webm");
  expect(result.isOk()).toBe(true);
  if (result.isOk()) {
    expect(result.get().durationMs).toBeGreaterThan(14700);
    expect(result.get().durationMs).toBeLessThanOrEqual(15000);
  }
});
test("corrupt encoded video payload fails full decoding after valid container inspection", async () => {
  const { parseWebm } = await import(
    "../../apps/be-insta/src/domains/stories/adapters/media/webm/parse"
  );
  const { one } = await import(
    "../../apps/be-insta/src/domains/stories/adapters/media/webm/reader"
  );
  const { ebmlId } = await import(
    "../../apps/be-insta/src/domains/stories/adapters/media/webm/conts"
  );
  const bytes = await Bun.file(
    new URL("../fixtures/media/webm/chrome-vp8.webm", import.meta.url),
  ).bytes();
  const segment = one(parseWebm(bytes), ebmlId.segment);
  const block = one(
    one(segment.children, ebmlId.cluster).children,
    ebmlId.simpleBlock,
  );
  bytes.fill(255, block.data + 4, block.end);
  const inspector = createMediaInspector();
  try {
    expect(
      (
        await inspector.inspect({
          source: new Blob([bytes]).stream(),
          maxBytes: 20971520,
          maxDurationMs: 15000,
          deadline: Date.now() + 10000,
        })
      ).toJSON(),
    ).toMatchObject({ error: "MALFORMED_MEDIA" });
  } finally {
    await inspector.close();
  }
});

test("track order is independent of numeric IDs; audio-first WebM still decodes", async () => {
  const { editWebm, element } = await import("../fixtures/media/webm/modify");
  const bytes = await Bun.file(
    new URL("../fixtures/media/webm/chrome-vp8.webm", import.meta.url),
  ).bytes();
  const reordered = editWebm(bytes, (node, payload) =>
    node.id === 0x1654ae6b
      ? new Uint8Array(
          Buffer.concat(
            [...node.children]
              .reverse()
              .map((track) =>
                element(track.id, bytes.subarray(track.data, track.end)),
              ),
          ),
        )
      : payload,
  );
  const inspector = createMediaInspector();
  try {
    expect(
      (
        await inspector.inspect({
          source: new Blob([reordered]).stream(),
          maxBytes: 20971520,
          maxDurationMs: 15000,
          deadline: Date.now() + 10000,
        })
      ).isOk(),
    ).toBe(true);
  } finally {
    await inspector.close();
  }
});

test("fresh production recorder fixtures cover both browsers/codecs/modes at short and maximum capture", async () => {
  const provenance = freshProvenance;
  expect(provenance.records).toHaveLength(16);
  for (const capture of provenance.records) {
    const bytes = await Bun.file(
      new URL(`../fixtures/media/webm/fresh/${capture.file}`, import.meta.url),
    ).bytes();
    expect(Bun.CryptoHasher.hash("sha256", bytes, "hex")).toBe(capture.sha256);
    const result = await inspect(`fresh/${capture.file}`);
    expect(result.toJSON()).toMatchObject({
      tag: "Ok",
      value: {
        container: "webm",
        videoCodec: capture.codec,
        audioCodec: "opus",
      },
    });
    if (result.isOk()) {
      expect(result.get().durationMs).toBeLessThanOrEqual(15000);
      if (capture.target === "max") {
        expect(capture.elapsedMs).toBeGreaterThanOrEqual(14800);
        expect(result.get().durationMs).toBeGreaterThan(14700);
      }
    }
  }
}, 60_000);

test.each(["chrome", "msedge"])(
  "fresh %s real over15s and long-video short-audio forged1s fail the strict horizon",
  async (channel) => {
    for (const kind of ["over15", "shortaudio-forged"])
      expect(
        (await inspect(`fresh/${channel}-${kind}.webm`)).toJSON(),
      ).toMatchObject({ tag: "Error", error: "TOO_LONG" });
  },
);
