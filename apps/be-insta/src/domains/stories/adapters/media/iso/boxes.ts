import { containerBoxes, isoLayout } from "./conts";
import type { IsoBox } from "./types";

/**
 * Разбирает короткий либо extended ISO-заголовок и проверяет безопасный размер внутри
 * родительских границ.
 */
const readBox = ({
  view,
  start,
  end,
}: Readonly<{ view: DataView; start: number; end: number }>) => {
  if (end - start < isoLayout.headerBytes) throw new Error("Box header");
  const short = view.getUint32(start);
  const extended = short === 1;
  const header = extended
    ? isoLayout.extendedHeaderBytes
    : isoLayout.headerBytes;
  if (end - start < header) throw new Error("Extended box header");
  const size = extended
    ? Number(view.getBigUint64(start + isoLayout.headerBytes))
    : short;
  if (!Number.isSafeInteger(size) || size < header || start + size > end)
    throw new Error("Box bounds");
  const type = String.fromCharCode(
    ...new Uint8Array(
      view.buffer,
      view.byteOffset + start + isoLayout.wordBytes,
      isoLayout.wordBytes,
    ),
  );
  return { type, start, data: start + header, end: start + size };
};
/**
 * Строит дерево известных ISO-контейнеров с общим бюджетом числа boxes и глубины
 * вложенности.
 */
export const parseBoxes = ({
  view,
  start,
  end,
}: Readonly<{
  view: DataView;
  start: number;
  end: number;
}>): readonly IsoBox[] => {
  let count = 0;
  /**
   * Последовательно разбирает дочерние boxes, расходуя общий бюджет дерева; неизвестные
   * типы оставляет листьями.
   */
  const readChildren = (
    start: number,
    end: number,
    depth: number,
  ): readonly IsoBox[] => {
    if (depth > isoLayout.maxDepth) throw new Error("Box nesting");
    const boxes: IsoBox[] = [];
    let position = start;
    while (position < end) {
      if (count >= isoLayout.maxBoxes) throw new Error("Box budget");
      count++;
      const box = readBox({ view, start: position, end });
      const children = containerBoxes.includes(box.type)
        ? readChildren(box.data, box.end, depth + 1)
        : [];
      boxes.push({ ...box, children });
      position = box.end;
    }
    return boxes;
  };
  return readChildren(start, end, 0);
};
/**
 * Требует ровно один box заданного типа; отсутствие и дубликаты отклоняет как
 * неоднозначную структуру media.
 */
export const requireBox = (boxes: readonly IsoBox[], type: string) => {
  const matching = boxes.filter((box) => box.type === type);
  if (matching.length !== 1) throw new Error("Missing or duplicate box");
  const box = matching[0];
  if (!box) throw new Error("Missing box");
  return box;
};
