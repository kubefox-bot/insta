// Inserts an actual ISO edit list into the native Chrome track. Fragment data
// offsets are relative to moof, so the original encoded samples stay unchanged.
export const withLeadingEmptyEdit = (bytes: Uint8Array) => {
  const original = Buffer.from(bytes);
  const moov = original.indexOf("moov") - 4;
  const track = original.indexOf("trak") - 4;
  const insert = track + original.readUInt32BE(track);
  const movie = original.indexOf("mvhd") + 4;
  const scale = original.readUInt32BE(
    movie + (original[movie] === 1 ? 20 : 12),
  );
  const edit = Buffer.alloc(48);
  edit.writeUInt32BE(48, 0);
  edit.write("edts", 4);
  edit.writeUInt32BE(40, 8);
  edit.write("elst", 12);
  edit.writeUInt32BE(2, 20);
  edit.writeUInt32BE(scale * 20, 24);
  edit.writeInt32BE(-1, 28);
  edit.writeUInt16BE(1, 32);
  edit.writeUInt32BE(scale * 2, 36);
  edit.writeInt32BE(0, 40);
  edit.writeUInt16BE(1, 44);
  const value = Buffer.concat([
    original.subarray(0, insert),
    edit,
    original.subarray(insert),
  ]);
  value.writeUInt32BE(original.readUInt32BE(moov) + edit.length, moov);
  value.writeUInt32BE(original.readUInt32BE(track) + edit.length, track);
  return new Uint8Array(value);
};
