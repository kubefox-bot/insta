import { expect, test } from "bun:test";
import { launchDecoder } from "../../apps/be-insta/src/domains/stories/adapters/media/launch-decoder";
import { readDecoder } from "../../apps/be-insta/src/domains/stories/adapters/media/read-decoder";
import { verifyWebmOutput } from "../../apps/be-insta/src/domains/stories/adapters/media/webm/decode";
import { inspectWebm } from "../../apps/be-insta/src/domains/stories/adapters/media/webm/inspect";

const bytes = await Bun.file(
  new URL("../fixtures/media/webm/chrome-vp8.webm", import.meta.url),
).bytes();
const inventory = inspectWebm(bytes);
// This baseline is actual complete bounded ffprobe output, not rows synthesized
// from the production inventory. Every mutation preserves all unrelated rows.
const output = await readDecoder({
  child: launchDecoder(bytes, { container: "webm" }),
  signal: AbortSignal.timeout(10000),
});
if (output === null) throw Error("Native fixture full decode failed");
const lines = output.trim().split("\n");
test("complete native compact decoder output is accepted before mutations", () => {
  expect(lines.filter((line) => line.startsWith("frame|"))).toHaveLength(29);
  expect(lines.filter((line) => line.startsWith("stream|"))).toHaveLength(2);
  expect(verifyWebmOutput({ output, inventory })).toBe(true);
});
test.each([
  { name: "sample count", prefix: "frame|audio|", column: 5 },
  { name: "PTS", prefix: "frame|video|", column: 3 },
  { name: "packet size", prefix: "frame|video|", column: 4 },
  { name: "codec", prefix: "stream|0|", column: 2 },
  { name: "frame count", prefix: "frame|video|", column: null },
] as const)(
  "complete decoder output rejects one changed $name",
  ({ name, prefix, column }) => {
    expect(verifyWebmOutput({ output, inventory })).toBe(true);
    // Remove the LAST video frame: earlier rows still align, so only final
    // inventory-count equality can reject this otherwise complete output.
    const target =
      column === null
        ? lines.reduce(
            (last, line, index) => (line.startsWith(prefix) ? index : last),
            -1,
          )
        : lines.findIndex((line) => line.startsWith(prefix));
    if (target < 0) throw Error("Expected native output row");
    const changed = lines
      .flatMap((line, index) => {
        if (index !== target) return [line];
        if (column === null) return [];
        const fields = line.split("|");
        fields[column] =
          name === "codec" ? "vp9" : String(Number(fields[column]) + 1);
        return [fields.join("|")];
      })
      .join("\n");
    expect(verifyWebmOutput({ output: changed, inventory })).toBe(false);
  },
);
