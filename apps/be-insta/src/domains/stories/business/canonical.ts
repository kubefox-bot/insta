import type { StoryPersistence } from "../ports/persistence/interfaces";
import { storyPublished } from "./conts";
/**
 * Формирует canonical событие публикации со стабильными event/effect/operation
 * идентификаторами для записи вместе с бизнес-эффектом.
 */
export const canonicalStory = (
  input: Parameters<StoryPersistence["publish"]>[0],
) => ({
  ...storyPublished,
  eventId: input.eventId,
  analyticsEventId: input.eventId,
  operationId: input.claim.operationId,
  actorId: input.claim.actorId,
  storyId: input.storyId,
  effectId: input.storyId,
  occurredAt: input.now,
});
