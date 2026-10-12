import { readBlocks } from "./blocks";
import { ebmlId, headerLimits, webmPolicy } from "./conts";
import { verifyIndices } from "./indices";
import { parseWebm } from "./parse";
import { one, readFloat, readUnsigned } from "./reader";
import { readTracks } from "./tracks";
import type { Element, WebmInventory } from "./types";
import { UnsupportedWebm } from "./unsupported";
/**
 * Проверяет корневую структуру, DocType и timestamp scale, затем собирает дорожки/пакеты
 * и сверяет индексы. Отсутствующую metadata duration оставляет нулём для последующего
 * отказа доказательства horizon.
 */
export const inspectWebm = (bytes: Uint8Array): WebmInventory => {
  const nodes = parseWebm(bytes);
  const header = one(nodes, ebmlId.header);
  const segment = one(nodes, ebmlId.segment);
  if (
    nodes[0] !== header ||
    nodes.at(-1) !== segment ||
    segment.end !== bytes.length
  )
    throw Error("WebM root layout");
  const doctype = one(header.children, ebmlId.doctype);
  if (
    new TextDecoder().decode(bytes.subarray(doctype.data, doctype.end)) !==
    "webm"
  )
    throw new UnsupportedWebm("DocType");
  verifyHeader({ bytes, header });
  const info = one(segment.children, ebmlId.info);
  if (
    readUnsigned(bytes, one(info.children, ebmlId.scale)) !==
    webmPolicy.timestampScaleNs
  )
    throw new UnsupportedWebm("TimestampScale profile");
  const duration = info.children.find((node) => node.id === ebmlId.duration);
  const metadataMs = duration ? readFloat(bytes, duration) : 0;
  const tracks = readTracks({ bytes, nodes: segment.children });
  const packets = readBlocks({ bytes, nodes: segment.children, tracks });
  verifyIndices({ bytes, segment, tracks, packets });
  return { metadataMs, tracks, packets };
};

/**
 * Проверяет поддерживаемые версии EBML и точное объявление ширины ID/size, отклоняя
 * несовместимый профиль.
 */
const verifyHeader = ({
  bytes,
  header,
}: Readonly<{ bytes: Uint8Array; header: Element }>) => {
  for (const [key, max] of Object.entries(headerLimits)) {
    const value = readUnsigned(bytes, one(header.children, Number(key)));
    if (value < 1 || value > max)
      throw new UnsupportedWebm("EBML header profile");
  }
  for (const id of [ebmlId.maxIdLength, ebmlId.maxSizeLength]) {
    if (readUnsigned(bytes, one(header.children, id)) !== headerLimits[id])
      throw new UnsupportedWebm("Declared EBML widths");
  }
};
