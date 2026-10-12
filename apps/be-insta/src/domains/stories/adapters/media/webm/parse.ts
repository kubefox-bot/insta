import { childrenByParent, ebmlId, repeatableIds, webmPolicy } from "./conts";
import { validateLeaf } from "./leaf";
import { readVint } from "./reader";
import type { EbmlReadContext, EbmlScope, Element } from "./types";

/**
 * Определяет завершение unknown-size cluster при встрече допустимого дочернего элемента
 * segment.
 */
const endsUnknownCluster = ({
  id,
  scope,
}: Readonly<{ id: number; scope: EbmlScope }>) =>
  scope.unknown &&
  scope.parent === ebmlId.cluster &&
  childrenByParent[ebmlId.segment]?.includes(id);
/**
 * Проверяет допустимость элемента в родителе и его границы; unknown size разрешает только
 * segment/cluster, а соседний элемент завершает unknown cluster.
 */
const readHeader = ({
  bytes,
  at,
  scope,
}: Readonly<{ bytes: Uint8Array; at: number; scope: EbmlScope }>) => {
  const tag = readVint({ bytes, at, end: scope.end, id: true });
  const id = Number(tag.value);
  if (id !== ebmlId.void && !childrenByParent[scope.parent]?.includes(id)) {
    if (endsUnknownCluster({ id, scope })) return null;
    throw Error("Unsupported EBML parent/element");
  }
  const size = readVint({ bytes, at: at + tag.width, end: scope.end });
  const data = at + tag.width + size.width;
  if (size.unknown && id !== ebmlId.segment && id !== ebmlId.cluster)
    throw Error("Unknown-size leaf/master");
  if (!size.unknown && size.value > BigInt(scope.end - data))
    throw Error("EBML parent bounds");
  return {
    id,
    data,
    unknown: size.unknown,
    end: size.unknown ? scope.end : data + Number(size.value),
  };
};
/**
 * Разбирает одну область EBML с общим бюджетом элементов и глубины, отклоняя запрещённые
 * дубликаты. Локально меняет счётчик общего read context.
 */
const readScope = ({
  context,
  scope,
}: Readonly<{ context: EbmlReadContext; scope: EbmlScope }>): Readonly<{
  nodes: readonly Element[];
  end: number;
}> => {
  if (scope.depth > webmPolicy.maxDepth) throw Error("EBML depth budget");
  const nodes: Element[] = [];
  const seen = new Set<number>();
  let at = scope.start;
  while (at < scope.end) {
    const header = readHeader({ bytes: context.bytes, at, scope });
    if (!header) break;
    if (++context.budget.elements > webmPolicy.maxElements)
      throw Error("EBML element budget");
    if (seen.has(header.id) && !repeatableIds.includes(header.id))
      throw Error("Duplicate EBML element");
    seen.add(header.id);
    const parsed = readChildren({ context, header, depth: scope.depth + 1 });
    const node = {
      ...header,
      start: at,
      end: parsed.end,
      children: parsed.nodes,
    };
    nodes.push(node);
    at = parsed.end;
  }
  return { nodes, end: at };
};
/**
 * Валидирует payload листа либо рекурсивно разбирает master в его границах, сохраняя
 * unknown-size семантику.
 */
const readChildren = ({
  context,
  header,
  depth,
}: Readonly<{
  context: EbmlReadContext;
  header: Readonly<{ id: number; data: number; end: number; unknown: boolean }>;
  depth: number;
}>) => {
  if (!childrenByParent[header.id]) {
    validateLeaf({ bytes: context.bytes, node: header });
    return { nodes: [], end: header.end };
  }
  return readScope({
    context,
    scope: {
      start: header.data,
      end: header.end,
      parent: header.id,
      unknown: header.unknown,
      depth,
    },
  });
};
/**
 * Начинает ограниченный разбор полного массива байтов с новым бюджетом; исходные байты не
 * изменяет.
 */
export const parseWebm = (bytes: Uint8Array) =>
  readScope({
    context: { bytes, budget: { elements: 0 } },
    scope: { start: 0, end: bytes.length, parent: 0, unknown: false, depth: 0 },
  }).nodes;
