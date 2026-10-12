export const createReadBarrier = () => {
  const release = Promise.withResolvers<void>();
  const state = { started: false };
  return {
    started: () => state.started,
    release: () => release.resolve(),
    wait: async (signal?: AbortSignal) => {
      state.started = true;
      if (signal?.aborted) throw signal.reason;
      const stopped = Promise.withResolvers<never>();
      const abort = () => stopped.reject(signal?.reason);
      signal?.addEventListener("abort", abort, { once: true });
      try {
        await Promise.race([release.promise, stopped.promise]);
      } finally {
        signal?.removeEventListener("abort", abort);
      }
    },
  };
};
