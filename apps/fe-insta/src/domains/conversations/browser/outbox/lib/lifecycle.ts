import type { QueueActor } from "../domain/types";
import type {
  OutboxDependencies,
  OutboxProjection,
  OutboxRuntime,
} from "./types";
/** Связывает смену auth, межвкладочные изменения и logout с отменой работы; возвращает освобождение подписок и ресурсов очереди. */
export const connectLifecycle = ({
  dependencies,
  state,
  projection,
  background,
}: Readonly<{
  dependencies: OutboxDependencies;
  state: OutboxRuntime;
  projection: OutboxProjection;
  background: () => void;
}>) => {
  const { auth, queue, changes } = dependencies;
  const clearing: { pending?: Promise<void> } = {};
  /** Запрашивает отмену всех выполняющихся пользовательских подтверждений через их собственные контроллеры. */
  const cancelConfirmations = () => {
    for (const controller of state.confirmationControllers) controller.abort();
  };
  const releaseAuth = auth.subscribe(() => {
    state.epoch++;
    cancelConfirmations();
    if (state.passActor) state.controller?.abort();
    projection.clear();
    background();
  });
  const releaseChanges = changes.subscribe(background);
  /** Отзывает текущую эпоху и работу, скрывает записи и удаляет очередь выходящего владельца; ошибку удаления сохраняет и пробрасывает. */
  const clearOwner = async (actor: QueueActor | null) => {
    state.epoch++;
    cancelConfirmations();
    clearTimeout(state.timer);
    state.controller?.abort();
    projection.clear();
    if (!actor) return;
    const cleared = await queue.clear(actor.ownerId);
    changes.publish();
    if (cleared.isError()) {
      if (!state.disposed)
        projection.issue({ code: cleared.getError(), source: "logout" });
      throw new Error(cleared.getError());
    }
  };
  const releaseLogout = auth.registerLogout((actor) => {
    const pending = clearOwner(actor);
    clearing.pending = pending;
    return pending;
  });
  return () => {
    if (state.disposed) return;
    state.disposed = true;
    state.epoch++;
    cancelConfirmations();
    clearTimeout(state.timer);
    state.controller?.abort();
    releaseAuth();
    releaseChanges();
    releaseLogout();
    projection.clear();
    /** Закрывает канал изменений и соединение очереди после завершения ожидаемой очистки logout. */
    const close = () => {
      changes.close();
      queue.close();
    };
    if (clearing.pending) {
      void clearing.pending.then(close, close);
      return;
    }
    close();
  };
};
