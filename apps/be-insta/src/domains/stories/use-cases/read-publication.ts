import type { StoryActor } from "../domain/types";
import type { StoryDependencies } from "../ports/persistence/interfaces";
/**
 * Читает durable исход operation id в пространстве авторизованного пользователя, не
 * раскрывая чужую публикацию. Подтверждённый published обновляет ленту, включая
 * восстановление после crash; deferred оставляет durable outbox для maintenance.
 */
export const readPublication = async (
  input: Readonly<{ actor: StoryActor; operationId: string }>,
  dependencies: Pick<StoryDependencies, "persistence" | "refreshFeed">,
) => {
  const status = await dependencies.persistence.read({
    actorId: input.actor.userId,
    operationId: input.operationId,
  });
  if (status.state === "published")
    await dependencies.refreshFeed({
      actorId: input.actor.userId,
      operationId: input.operationId,
    });
  return status;
};
