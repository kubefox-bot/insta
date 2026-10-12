import { context } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";

// One OTel context manager is shared by technical roots within this process.
// Each root owns a lease; it is disabled only after the last root closes.
const state: {
  manager: AsyncLocalStorageContextManager | undefined;
  leases: number;
} = { manager: undefined, leases: 0 };
/** Получает lease общего OTel context manager; чужой global manager отклоняет. Возвращённое идемпотентное освобождение отключает принадлежащий runtime manager только после последнего lease. */
export const acquireTraceContext = () => {
  if (!state.manager) {
    const manager = new AsyncLocalStorageContextManager().enable();
    if (!context.setGlobalContextManager(manager)) {
      manager.disable();
      throw new Error(
        "OTel context manager already owned outside this runtime",
      );
    }
    state.manager = manager;
  }
  state.leases++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    state.leases--;
    if (state.leases === 0) {
      context.disable();
      state.manager?.disable();
      state.manager = undefined;
    }
  };
};
