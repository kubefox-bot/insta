import { loadSession } from "../load-session";

/** Лениво читает сессию один раз для текущего запроса; сохраняет общий Promise, включая guest/unavailable, без повторной авторизации и состояния между запросами. */
export const createSessionSnapshotReader = (
  input: Parameters<typeof loadSession>[0],
): (() => Promise<Awaited<ReturnType<typeof loadSession>>>) => {
  let snapshot: ReturnType<typeof loadSession> | undefined;
  return () => {
    snapshot ??= loadSession(input);
    return snapshot;
  };
};
