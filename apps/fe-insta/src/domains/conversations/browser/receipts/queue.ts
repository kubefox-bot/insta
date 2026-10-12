import type { ReceiptQueue, ReceiptQueueDependencies } from "./ports/types";
import { ReceiptQueueRuntime } from "./runtime";
/** Создаёт отдельный runtime квитанций и раскрывает его читаемое состояние; вызывающий владеет dispose. */
export const createReceiptQueue = (
  dependencies: ReceiptQueueDependencies,
): ReceiptQueue => {
  const runtime = new ReceiptQueueRuntime(dependencies);
  return {
    view: runtime.view,
    acceptMessages: runtime.acceptMessages,
    readVisible: runtime.readVisible,
    retry: runtime.retry,
    dispose: runtime.dispose,
  };
};
