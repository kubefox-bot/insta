import type { DeliveryPosition } from "@insta/contracts/realtime";
import type {
  DeliveryRuntimePorts,
  DeliverySelection,
} from "../../ports/delivery/types";
/** Владеет watch lifetime и одним coalesced wakeup; provider callback никогда не ждёт browser delivery. */
export const listenDelivery = (
  input: DeliverySelection & Readonly<{ after: DeliveryPosition }>,
  ports: DeliveryRuntimePorts,
) => {
  const lifetime = new AbortController();
  const signal = AbortSignal.any([input.signal, lifetime.signal]);
  let changed = true;
  let recovery = false;
  let wake: (() => void) | undefined;
  /** Объединяет notifications без неограниченной очереди payload/promises. */
  const notify = () => {
    changed = true;
    wake?.();
    wake = undefined;
  };
  signal.addEventListener("abort", notify, { once: true });
  const operation = ports.streams
    .watch({
      stream: input.target,
      after: input.after,
      signal,
      onAvailable: async (notice) => {
        if (notice.kind !== "available") recovery = true;
        notify();
      },
    })
    .catch(() => {
      if (!signal.aborted) recovery = true;
      notify();
    });
  return {
    needsRecovery: () => recovery,
    /** Сбрасывает только уже учтённый wake перед чтением, сохраняя races во время I/O. */
    reading: () => {
      changed = false;
    },
    /** Ждёт наблюдаемое изменение или отмену, без polling. */
    wait: async () => {
      if (changed || signal.aborted) return;
      await new Promise<void>((resolve) => {
        wake = resolve;
      });
    },
    /** Последний subscriber ждёт фактического reader settlement. */
    close: async () => {
      lifetime.abort();
      await operation;
      signal.removeEventListener("abort", notify);
    },
  };
};
