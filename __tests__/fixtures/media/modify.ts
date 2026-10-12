// This fixture mutator targets the recorded Chrome file's first (video) trun.
// Expectations use explicit millisecond boundaries, independently of the inspector.
export const withFinalVideoDuration = (bytes: Uint8Array, endMs: number) => {
  const value = bytes.slice();
  const view = new DataView(value.buffer);
  const trun = Buffer.from(value).indexOf("trun");
  if (trun < 0 || view.getUint32(trun + 4) !== 0x01000305)
    throw new Error("Unexpected native fixture layout");
  const count = view.getUint32(trun + 8);
  const samples = trun + 20;
  let before = 0;
  for (let index = 0; index < count - 1; index++)
    before += view.getUint32(samples + index * 8);
  // Chrome fixture has an explicit video timescale of 20000 ticks/second.
  view.setUint32(samples + (count - 1) * 8, endMs * 20 - before);
  return value;
};
export const withNonVclVideoSample = (bytes: Uint8Array) => {
  const value = Buffer.from(bytes);
  const moof = value.indexOf("moof") - 4;
  const trun = value.indexOf("trun");
  const first = moof + value.readInt32BE(trun + 12);
  const second = first + value.readUInt32BE(trun + 24);
  const size = value.readUInt32BE(trun + 32);
  value.writeUInt32BE(size - 4, second);
  value.fill(255, second + 4, second + size);
  value[second + 4] = 12; // H264 filler-data NAL; contains no coded picture.
  value[second + size - 1] = 128;
  return new Uint8Array(value);
};
