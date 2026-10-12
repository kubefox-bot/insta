import { expect, test } from "bun:test";
import { parseBoxes } from "../../apps/be-insta/src/domains/stories/adapters/media/iso/boxes";
import { readRun } from "../../apps/be-insta/src/domains/stories/adapters/media/iso/run";

const boxes = (count: number) => {
  const value = Buffer.alloc(count * 8);
  for (let at = 0; at < value.length; at += 8) {
    value.writeUInt32BE(8, at);
    value.write("free", at + 4);
  }
  return value;
};
test("ISO box budget covers siblings and nested containers together", () => {
  const first = Buffer.concat([Buffer.alloc(8), boxes(3000)]);
  first.writeUInt32BE(first.length, 0);
  first.write("moov", 4);
  const second = Buffer.concat([Buffer.alloc(8), boxes(1100)]);
  second.writeUInt32BE(second.length, 0);
  second.write("moov", 4);
  const all = Buffer.concat([first, second]);
  expect(() =>
    parseBoxes({
      view: new DataView(all.buffer, all.byteOffset, all.length),
      start: 0,
      end: all.length,
    }),
  ).toThrow("Box budget");
});
test("sample count is rejected before materialization and respects remaining aggregate budget", () => {
  const bytes = new Uint8Array(28);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x301);
  view.setUint32(4, 2);
  view.setUint32(8, 100);
  view.setUint32(12, 1);
  view.setUint32(16, 1);
  view.setUint32(20, 1);
  view.setUint32(24, 1);
  const input = {
    view,
    box: { type: "trun", start: 0, data: 0, end: 28, children: [] },
    defaults: { trackId: 1, base: 0, duration: 0, size: 0 },
    decodeTime: 0,
    mdats: [{ type: "mdat", start: 92, data: 100, end: 200, children: [] }],
    remainingSamples: 1,
  };
  expect(() => readRun(input)).toThrow("Sample budget");
  view.setUint32(4, 0xffffffff);
  expect(() => readRun({ ...input, remainingSamples: 8192 })).toThrow(
    "Sample budget",
  );
});
