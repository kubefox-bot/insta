import type { OutboxLocks } from "../ports/auth";
/** Связывает сериализацию проходов с браузерным LockManager; без API выполняет операцию непосредственно. */
export const createOutboxLocks = (
  manager: LockManager | undefined,
): OutboxLocks => ({
  /** Пытается занять блокировку владельца без ожидания; занятость возвращает null, отсутствие LockManager не даёт межвкладочной блокировки. */
  run: (ownerId, execute) =>
    manager
      ? manager.request(
          `insta:outbox:${ownerId}`,
          { ifAvailable: true },
          (lock) => (lock ? execute() : Promise.resolve(null)),
        )
      : execute(),
});
