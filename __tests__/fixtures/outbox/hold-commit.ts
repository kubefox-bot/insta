import { commitHoldTimeoutMs } from "./conts";

export const holdOwnedCommit = (databaseName: string) => {
  const originalPut = IDBObjectStore.prototype.put;
  const originalGet = IDBObjectStore.prototype.get;
  const state = {
    started: false,
    aborted: false,
    committed: false,
    held: true,
  };
  const owned: {
    transaction?: IDBTransaction;
    timer?: ReturnType<typeof setTimeout>;
  } = {};
  const finished = (event: Event) => {
    state.aborted = event.type === "abort";
    state.committed = event.type === "complete";
    state.held = false;
    clearTimeout(owned.timer);
    owned.transaction?.removeEventListener("abort", finished);
    owned.transaction?.removeEventListener("complete", finished);
  };
  IDBObjectStore.prototype.put = function (
    this: IDBObjectStore,
    value: unknown,
    key?: IDBValidKey,
  ) {
    const written = originalPut.call(this, value, key);
    if (this.transaction.db.name !== databaseName || state.started)
      return written;
    state.started = true;
    owned.transaction = this.transaction;
    this.transaction.addEventListener("abort", finished);
    this.transaction.addEventListener("complete", finished);
    owned.timer = setTimeout(() => {
      state.held = false;
    }, commitHoldTimeoutMs);
    const keepActive = () => {
      if (!state.held) return;
      const pending = originalGet.call(this, "owned-commit-barrier");
      pending.onsuccess = keepActive;
    };
    keepActive();
    return written;
  };
  return {
    started: () => state.started,
    outcome: () => ({ aborted: state.aborted, committed: state.committed }),
    release: () => {
      state.held = false;
      clearTimeout(owned.timer);
      IDBObjectStore.prototype.put = originalPut;
    },
  };
};
