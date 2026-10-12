import { receiptFailure } from "./failure";
import type { ReceiptQueueDependencies } from "./ports/types";
import type { ReceiptAttempt, ReceiptRequest } from "./types";
/** Отправляет пакет квитанций и переводит отказ транспорта в повторяемый либо окончательный исход по текущим часам. */
export const attemptReceipt = async ({
  request,
  signal,
  dependencies,
}: Readonly<{
  request: ReceiptRequest;
  signal: AbortSignal;
  dependencies: ReceiptQueueDependencies;
}>): Promise<ReceiptAttempt> => {
  try {
    return {
      kind: "confirmed",
      snapshot: await dependencies.acknowledge({ ...request, signal }),
    };
  } catch (error) {
    return receiptFailure({ error, now: dependencies.clock.now() });
  }
};
