import { ebmlEncoding, leafKinds, leafSizes } from "./conts";
import { readFloat, readVint } from "./reader";
import type { Element } from "./types";
/**
 * Проверяет payload EBML-листа по его виду: UTF-8, конечный float, фиксированные UID/date
 * и допустимые integer/SeekID размеры. Binary оставляет профильным проверкам.
 */
export const validateLeaf = ({
  bytes,
  node,
}: Readonly<{
  bytes: Uint8Array;
  node: Pick<Element, "id" | "data" | "end">;
}>) => {
  const size = node.end - node.data;
  switch (leafKinds[node.id]) {
    case "binary":
      return;
    case "string":
      new TextDecoder("utf-8", { fatal: true }).decode(
        bytes.subarray(node.data, node.end),
      );
      return;
    case "float":
      readFloat(bytes, node);
      return;
    case "uid":
      if (size !== leafSizes.uid) throw Error("SegmentUID size");
      return;
    case "date":
      if (size !== leafSizes.date) throw Error("DateUTC size");
      return;
    case "id":
      if (
        readVint({ bytes, at: node.data, end: node.end, id: true }).width !==
        size
      )
        throw Error("Invalid SeekID encoding");
      return;
    default:
      if (size < 1 || size > ebmlEncoding.maxSizeBytes)
        throw Error("Integer leaf size");
  }
};
