import { parseWebm } from "../../../../apps/be-insta/src/domains/stories/adapters/media/webm/parse";
import type { Element } from "../../../../apps/be-insta/src/domains/stories/adapters/media/webm/types";
export const element = (id: number, bytes: Uint8Array, unknown = false) => {
  const tag = Buffer.from(
    id.toString(16).padStart(Math.ceil(id.toString(16).length / 2) * 2, "0"),
    "hex",
  );
  const size = Buffer.alloc(8);
  size.writeBigUInt64BE(
    unknown ? 0x01ffffffffffffffn : 0x0100000000000000n + BigInt(bytes.length),
  );
  return new Uint8Array(Buffer.concat([tag, size, bytes]));
};
export const uint = (value: number | bigint) => {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64BE(BigInt(value));
  return new Uint8Array(bytes);
};
export const editWebm = (
  bytes: Uint8Array,
  transform: (node: Element, payload: Uint8Array) => Uint8Array | null,
): Uint8Array<ArrayBuffer> => {
  const encode = (node: Element): Uint8Array => {
    const payload = node.children.length
      ? new Uint8Array(Buffer.concat(node.children.map(encode)))
      : bytes.subarray(node.data, node.end);
    const changed = transform(node, payload);
    return changed === null
      ? new Uint8Array()
      : element(node.id, changed, node.unknown);
  };
  return new Uint8Array(Buffer.concat(parseWebm(bytes).map(encode)));
};
export const withVideoGroup = (
  bytes: Uint8Array,
  fields: readonly Uint8Array[],
) => {
  let replaced = false;
  return editWebm(bytes, (node, payload) => {
    if (node.id !== 0x1f43b675 || replaced) return payload;
    return new Uint8Array(
      Buffer.concat(
        node.children.map((child) => {
          const data = bytes.slice(child.data, child.end);
          if (child.id !== 0xa3 || data[0] !== 0x81 || replaced)
            return element(child.id, data, child.unknown);
          replaced = true;
          data[3] = (data[3] ?? 0) & 0x7e;
          return element(
            0xa0,
            new Uint8Array(Buffer.concat([element(0xa1, data), ...fields])),
          );
        }),
      ),
    );
  });
};
