import { expect, test } from "bun:test";
import { ebmlId } from "../../apps/be-insta/src/domains/stories/adapters/media/webm/conts";
import { createMediaInspector } from "../../apps/be-insta/src/domains/stories/server/index";
import { editWebm, uint } from "../fixtures/media/webm/modify";

const original = await Bun.file(
  new URL("../fixtures/media/webm/chrome-vp8.webm", import.meta.url),
).bytes();
const inspect = async (bytes: Uint8Array<ArrayBuffer>) => {
  const inspector = createMediaInspector();
  try {
    return await inspector.inspect({
      source: new Blob([bytes]).stream(),
      maxBytes: 20971520,
      maxDurationMs: 15000,
      deadline: Date.now() + 10000,
    });
  } finally {
    await inspector.close();
  }
};
test.each(["missing", "zero", "duplicate"] as const)(
  "public WebM inspector rejects %s TrackUID",
  async (mode) => {
    let seen = 0;
    const changed = editWebm(original, (node, payload) => {
      if (node.id !== ebmlId.trackUid) return payload;
      seen++;
      if (mode === "duplicate") return uint(1);
      if (seen !== 1) return payload;
      return mode === "missing" ? null : uint(0);
    });
    expect((await inspect(changed)).toJSON()).toMatchObject({
      tag: "Error",
      error: "MALFORMED_MEDIA",
    });
  },
);
test("public WebM inspector preserves distinct full uint64 TrackUID values", async () => {
  const identifiers = [0xfffffffffffffffen, 0xffffffffffffffffn];
  let seen = 0;
  const changed = editWebm(original, (node, payload) => {
    if (node.id !== ebmlId.trackUid) return payload;
    const identifier = identifiers[seen++];
    if (identifier === undefined) throw Error("Unexpected fixture track");
    return uint(identifier);
  });
  expect(seen).toBe(2);
  expect((await inspect(changed)).toJSON()).toMatchObject({
    tag: "Ok",
    value: {
      container: "webm",
      videoCodec: "vp8",
      audioCodec: "opus",
      durationMs: 809,
    },
  });
});
