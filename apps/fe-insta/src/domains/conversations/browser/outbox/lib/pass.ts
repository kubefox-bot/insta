import type { DrainSummary } from "../domain/types";
import { drain } from "../use-cases/drain";
import { reconcileActor } from "../use-cases/lib/drain/reconcile";
import { scheduleNext } from "./scheduling";
import type {
  OutboxDependencies,
  OutboxProjection,
  OutboxRuntime,
} from "./types";

/** Восстанавливает auth при необходимости, выполняет проход очереди, обновляет проекцию и назначает следующий срок для текущего владельца. */
const executePass = async ({
  dependencies,
  state,
  projection,
  signal,
  background,
}: Readonly<{
  dependencies: OutboxDependencies;
  state: OutboxRuntime;
  projection: OutboxProjection;
  signal: AbortSignal;
  background: () => void;
}>): Promise<DrainSummary> => {
  const { auth, clock, changes } = dependencies;
  if (!auth.current()) {
    const recovered = await reconcileActor({ auth, signal });
    if (recovered.isError())
      return {
        sent: 0,
        confirmed: 0,
        needsConfirmation: 0,
        issue: recovered.getError(),
      };
  }
  const actor = auth.current();
  state.passActor = actor;
  if (!actor) {
    await projection.refresh();
    return { sent: 0, confirmed: 0, needsConfirmation: 0 };
  }
  const result = await drain(
    { ownerId: actor.ownerId, authGeneration: actor.generation, now: clock() },
    { ...dependencies, signal },
  );
  if (state.disposed) return result;
  const refreshed = await projection.refresh();
  if (result.sent) changes.publish();
  if (
    result.issue &&
    refreshed !== "read-failed" &&
    auth.current()?.generation === actor.generation
  )
    projection.issue({ code: result.issue, source: "drain" });
  await scheduleNext({ actor, dependencies, state, wake: background });
  return result;
};
/** Создаёт единственного владельца выполняемого прохода и объединяет повторные пробуждения до его завершения. */
export const createPass = ({
  dependencies,
  state,
  projection,
}: Readonly<{
  dependencies: OutboxDependencies;
  state: OutboxRuntime;
  projection: OutboxProjection;
}>) => {
  /** Запускает проход с обработкой отклонения Promise в диагностике persistence представления. */
  const background = () => {
    wake().catch(() =>
      projection.issue({ code: "PERSISTENCE_FAILED", source: "drain" }),
    );
  };
  /** Возвращает текущий проход либо запускает новый; освобождает контроллер и busy в finally и сохраняет запрос дополнительного пробуждения. */
  const wake = (): Promise<DrainSummary> => {
    if (state.disposed)
      return Promise.resolve({ sent: 0, confirmed: 0, needsConfirmation: 0 });
    if (state.running) {
      state.requestedWake = true;
      return state.running;
    }
    clearTimeout(state.timer);
    projection.busy(true);
    const controller = new AbortController();
    state.controller = controller;
    state.passActor = dependencies.auth.current();
    state.running = executePass({
      dependencies,
      state,
      projection,
      signal: controller.signal,
      background,
    }).finally(() => {
      controller.abort();
      state.controller = undefined;
      state.passActor = undefined;
      state.running = undefined;
      projection.busy(false);
      if (state.requestedWake && !state.disposed) {
        state.requestedWake = false;
        clearTimeout(state.timer);
        state.timer = setTimeout(background, 0);
      }
    });
    return state.running;
  };
  return { wake, background };
};
