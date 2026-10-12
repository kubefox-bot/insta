import { Result } from "@bloodyowl/boxed";
import { SessionErrorCode } from "@insta/contracts/errors";
import { confirmResume } from "../use-cases/confirm-resume";
import { enqueue } from "../use-cases/enqueue";
import type {
  OutboxBrowser,
  OutboxDependencies,
  OutboxProjection,
  OutboxRuntime,
} from "./types";

/** Подтверждает выбранные операции под собственным контроллером; поздний результат чужого поколения отклоняет, контроллер всегда освобождает. */
const confirmSelection = async ({
  operationIds,
  dependencies,
  state,
  projection,
  background,
}: Readonly<{
  operationIds: readonly string[];
  dependencies: OutboxDependencies;
  state: OutboxRuntime;
  projection: OutboxProjection;
  background: () => void;
}>) => {
  const { auth, queue, changes } = dependencies;
  const actor = auth.current();
  if (!actor || state.disposed)
    return Result.Error(SessionErrorCode.ActorChanged as const);
  const controller = new AbortController();
  state.confirmationControllers.add(controller);
  try {
    const result = await confirmResume(
      { ownerId: actor.ownerId, operationIds },
      { queue, auth, signal: controller.signal },
    );
    const current = auth.current();
    if (
      state.disposed ||
      controller.signal.aborted ||
      current?.ownerId !== actor.ownerId ||
      current.generation !== actor.generation
    )
      return Result.Error(SessionErrorCode.ActorChanged as const);
    if (result.isError()) {
      projection.issue({ code: result.getError(), source: "confirmation" });
      return result;
    }
    changes.publish();
    await projection.refresh();
    background();
    return result;
  } finally {
    controller.abort();
    state.confirmationControllers.delete(controller);
  }
};
/** Связывает постановку и ручное возобновление с текущим auth, проекцией и фоновым проходом. */
export const createOperations = ({
  dependencies,
  state,
  projection,
  background,
}: Readonly<{
  dependencies: OutboxDependencies;
  state: OutboxRuntime;
  projection: OutboxProjection;
  background: () => void;
}>): Pick<OutboxBrowser, "enqueue" | "confirmResume"> => {
  const { auth, queue, clock, uuid, changes } = dependencies;
  return {
    /** Сохраняет сообщение текущего владельца; после успеха обновляет вкладки и представление и будит отправку, смену поколения возвращает как ошибку. */
    enqueue: async (input) => {
      const actor = auth.current();
      if (!actor || state.disposed)
        return Result.Error(SessionErrorCode.ActorChanged as const);
      const result = await enqueue(
        { ...input, ownerId: actor.ownerId, authGeneration: actor.generation },
        { queue, clock, uuid },
      );
      if (auth.current()?.generation !== actor.generation)
        return Result.Error(SessionErrorCode.ActorChanged as const);
      if (result.isError()) {
        projection.issue({ code: result.getError(), source: "enqueue" });
        return result;
      }
      changes.publish();
      await projection.refresh();
      background();
      return result;
    },
    /** Передаёт явный выбор идентификаторов в отменяемый сценарий подтверждения и обновления представления. */
    confirmResume: (operationIds) =>
      confirmSelection({
        operationIds,
        dependencies,
        state,
        projection,
        background,
      }),
  };
};
