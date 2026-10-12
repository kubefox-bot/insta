import type { RecorderState } from "../../types";

/** Уведомляет подписчика о состоянии; его исключение сообщает в следующей микрозадаче, чтобы не прервать capture и завершение записи. */
export const notifySubscriber = (
  input: Readonly<{
    subscriber: (state: RecorderState) => void;
    state: RecorderState;
  }>,
) => {
  try {
    input.subscriber(input.state);
  } catch (cause) {
    // Report callback failures on the next microtask so capture effects and
    // settlement complete independently. This is not a recorder error outcome.
    queueMicrotask(() => {
      if (typeof globalThis.reportError === "function")
        globalThis.reportError(cause);
      else throw cause;
    });
  }
};
