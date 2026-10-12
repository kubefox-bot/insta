export const createClock = () => {
  let now = 0;
  let id = 0;
  const timers = new Map<number, { at: number; run: () => void }>();
  const settle = async () => {
    for (let turn = 0; turn < 12; turn++) await Promise.resolve();
  };
  return {
    clock: {
      now: () => now,
      schedule: (run: () => void, delay: number) => {
        const token = ++id;
        timers.set(token, { at: now + delay, run });
        return () => {
          timers.delete(token);
        };
      },
    },
    count: () => timers.size,
    advance: async (duration: number) => {
      await settle();
      const end = now + duration;
      for (;;) {
        const next = [...timers]
          .filter(([, timer]) => timer.at <= end)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        now = next[1].at;
        timers.delete(next[0]);
        next[1].run();
        await settle();
      }
      now = end;
      await settle();
    },
  };
};
