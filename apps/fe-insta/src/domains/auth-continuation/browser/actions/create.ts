import { handoffAction } from "./handoff";
import { createActionLifetime } from "./lifetime";
import type { ActionInput, ActionOutcome, Dependencies } from "./types";
/** Владеет pending-действием до передачи intent UI; dispose завершает lifetime и освобождает identity-подписку. */
export const createContinuationAction = (dependencies: Dependencies) => {
  const lifetime = createActionLifetime(dependencies);
  return {
    invalidate: lifetime.invalidate,
    dispose: lifetime.dispose,
    /** Проверяет выбор до I/O и после receipt; устаревший intent адресно отменяет, актуальный передаёт ровно одному эффекту. */
    begin: async ({
      input,
      trigger,
      isSelected,
    }: ActionInput): Promise<ActionOutcome> => {
      const selection = lifetime.acquire(isSelected);
      if (selection.kind !== "selected") return selection.kind;
      const receipt = await dependencies.begin({ input });
      if (!lifetime.isCurrent(selection)) {
        if (receipt) await dependencies.cancel(receipt.intentId);
        return "stale";
      }
      if (!receipt) return "unavailable";
      await handoffAction(dependencies, {
        input,
        trigger,
        identity: selection.identity,
        intentId: receipt.intentId,
      });
      return "applied";
    },
  };
};
