import { processGroupPollMs, processGroupSignalRetryTimeoutMs } from "./conts";
import type {
  ProcessGroupSignal,
  ProcessGroupSignalOutcome,
  SendProcessGroupSignal,
} from "./types";

/** Посылает сигнал заданному target: ESRCH означает отсутствие, EPERM остаётся неопределённым отказом доступа, остальные ошибки пробрасываются. */
const trySignal = (
  target: number,
  signal: ProcessGroupSignal,
  send: SendProcessGroupSignal,
): ProcessGroupSignalOutcome => {
  try {
    send(target, signal);
    return { kind: "present" };
  } catch (error) {
    if (!(error instanceof Error && "code" in error)) throw error;
    switch (error.code) {
      case "ESRCH":
        return { kind: "absent" };
      case "EPERM":
        return { kind: "denied", error };
      default:
        throw error;
    }
  }
};

/** Обращается к process group через отрицательный PID. Возвращает наличие/отсутствие группы; EPERM повторяет до ограниченного deadline и затем выбрасывает ошибку, не принимая отказ за завершение. */
export const signalOwnedGroup = async ({
  id,
  signal,
  send = process.kill,
}: {
  readonly id: number;
  readonly signal: ProcessGroupSignal;
  readonly send?: SendProcessGroupSignal;
}) => {
  const deadline = performance.now() + processGroupSignalRetryTimeoutMs;
  while (true) {
    const outcome = trySignal(-id, signal, send);
    switch (outcome.kind) {
      case "present":
        return true;
      case "absent":
        return false;
      case "denied":
        // Darwin can return EPERM while an owned group is exiting but not reaped.
        // Keep this outcome indeterminate until signal succeeds, ESRCH, or timeout.
        if (performance.now() >= deadline)
          throw new Error(
            "Owned process group signal remained denied after bounded retry",
            { cause: outcome.error },
          );
        await Bun.sleep(processGroupPollMs);
    }
  }
};
