// Changes only the native AVC parameter-set dimensions. Container sample-entry
// dimensions remain640x480, exposing attempts to trust container geometry.
export const withHugeSps = (bytes: Uint8Array) => {
  const original = Buffer.from(bytes);
  const config = original.indexOf("avcC") + 4;
  const size = original.readUInt16BE(config + 6);
  const sps = original.subarray(config + 8, config + 8 + size);
  if (sps[1] !== 66) throw new Error("Expected baseline native SPS");
  const bits = [...sps]
    .map((byte) => byte.toString(2).padStart(8, "0"))
    .join("");
  let cursor = 32;
  const unsigned = () => {
    const start = cursor;
    while (bits[cursor] === "0") cursor++;
    const zeros = cursor - start;
    cursor += zeros + 1;
    return Number.parseInt(bits.slice(start + zeros, cursor), 2) - 1;
  };
  unsigned();
  unsigned();
  if (unsigned() !== 0) throw new Error("Expected native POC type0");
  unsigned();
  unsigned();
  cursor++;
  const start = cursor;
  unsigned();
  unsigned();
  const dimension = (value: number) => {
    const code = (value + 1).toString(2);
    return "0".repeat(code.length - 1) + code;
  };
  const changed =
    bits.slice(0, start) + dimension(511) + dimension(511) + bits.slice(cursor);
  const padded = changed.padEnd(Math.ceil(changed.length / 8) * 8, "0");
  const replacement = Buffer.from(
    padded.match(/.{8}/g)?.map((byte) => Number.parseInt(byte, 2)) ?? [],
  );
  const value = Buffer.concat([
    original.subarray(0, config + 8),
    replacement,
    original.subarray(config + 8 + size),
  ]);
  const delta = replacement.length - size;
  for (const name of [
    "moov",
    "trak",
    "mdia",
    "minf",
    "stbl",
    "stsd",
    "avc1",
    "avcC",
  ]) {
    const at = original.indexOf(name, name === "avc1" ? 100 : 0) - 4;
    value.writeUInt32BE(original.readUInt32BE(at) + delta, at);
  }
  value.writeUInt16BE(replacement.length, config + 6);
  return new Uint8Array(value);
};
