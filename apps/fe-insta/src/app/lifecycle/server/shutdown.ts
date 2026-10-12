import { closeContinuation } from "../../continuation/server/index.ts";
import {
  cancelDatabaseAcquisition,
  closeInfrastructure,
} from "../../infrastructure/server/database/index";
import { closeObservability } from "../../observability/server/index.ts";
import { closeSessions } from "../../users/server/session/index";
import { shutdownTimeoutMs } from "./conts";

const state: {
  deadline?: ReturnType<typeof setTimeout>;
  sessions?: Promise<void>;
  closing?: Promise<void>;
} = {};

/**
 * Однократно начинает shutdown: запускает watchdog, отменяет Mongo acquisition и
 * останавливает sessions; timeout завершает процесс с ошибкой, не доказывая settlement
 * pending revocations.
 */
export const prepareShutdown = () => {
  if (state.deadline) return;
  state.deadline = setTimeout(() => {
    process.stderr.write(
      "Application shutdown deadline exceeded; pending revocations retained\n",
    );
    process.exit(1);
  }, shutdownTimeoutMs);
  cancelDatabaseAcquisition();
  state.sessions = closeSessions();
  // The adapter's drained event owns propagation; attach a rejection handler now.
  state.sessions.catch(() => {
    process.stderr.write(
      "Session shutdown failed; pending revocations retained\n",
    );
  });
};

/**
 * Возвращает общий Promise остановки: ждёт sessions, затем закрывает инфраструктуру и
 * observability, собирая ошибки всех фаз; watchdog снимается после завершения этой
 * последовательности.
 */
export const closeApplication = (): Promise<void> => {
  prepareShutdown();
  state.closing ??= (async () => {
    try {
      const sessions = await Promise.allSettled([state.sessions]);
      const infrastructure = await Promise.allSettled([
        closeContinuation(),
        closeInfrastructure(),
      ]);
      const observability = await Promise.allSettled([closeObservability()]);
      const failure = [...sessions, ...infrastructure, ...observability].find(
        (result) => result.status === "rejected",
      );
      if (failure?.status === "rejected") throw failure.reason;
    } finally {
      clearTimeout(state.deadline);
    }
  })();
  return state.closing;
};
