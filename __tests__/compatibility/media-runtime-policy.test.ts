import { expect, test } from "bun:test";
import { inspectPacketFile } from "../../apps/be-insta/src/domains/stories/adapters/media/packets";
import { createMediaInspector } from "../../apps/be-insta/src/domains/stories/server/index";

test.each(["chrome-valid.mp4", "webm/chrome-vp8.webm"])(
  "real %s packet horizon obeys adjacent integer upload limits",
  async (name) => {
    const bytes = await Bun.file(
      new URL(`../fixtures/media/${name}`, import.meta.url),
    ).bytes();
    const actual = await inspectPacketFile({ bytes, maxDurationMs: 15000 });
    if (actual.isError()) throw new Error(actual.getError());
    const acceptedLimit = Math.ceil(actual.get().durationMs);
    expect(
      (await inspectPacketFile({ bytes, maxDurationMs: acceptedLimit })).isOk(),
    ).toBe(true);
    expect(
      (
        await inspectPacketFile({ bytes, maxDurationMs: acceptedLimit - 1 })
      ).toJSON(),
    ).toMatchObject({ tag: "Error", error: "TOO_LONG" });
    const inspector = createMediaInspector();
    try {
      const inspect = (maxDurationMs: number) =>
        inspector.inspect({
          source: new Blob([bytes]).stream(),
          maxBytes: 20971520,
          maxDurationMs,
          deadline: Date.now() + 10000,
        });
      expect((await inspect(acceptedLimit)).isOk()).toBe(true);
      expect((await inspect(acceptedLimit - 1)).toJSON()).toMatchObject({
        tag: "Error",
        error: "TOO_LONG",
      });
    } finally {
      await inspector.close();
    }
  },
);
