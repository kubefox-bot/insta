import type { RecoveryOperations } from "./types";
/**
 * Публикует готовую квитанцию выбранного intent и назначает её локальное истечение через
 * владельца lifetime.
 */
export const selectMetadata = (
  { view, expire }: Pick<RecoveryOperations, "view" | "expire">,
  receipt: Readonly<{ intentId: string; expiresAt: number }>,
) => {
  view.set({ kind: "ready", ...receipt });
  expire(receipt.expiresAt);
};
