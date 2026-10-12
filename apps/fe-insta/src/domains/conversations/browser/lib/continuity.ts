import type { Message } from "../types";
/** Продвигает baseline только через непрерывные следующие sequence; сообщения за разрывом не подтверждают полноту истории. */
export const verifiedContinuity = ({
  baseline,
  items,
}: Readonly<{ baseline: number; items: readonly Message[] }>) => {
  const sequences = new Set(items.map(({ sequence }) => sequence));
  let cursor = baseline;
  while (sequences.has(cursor + 1)) cursor += 1;
  return cursor;
};
