import { Result } from "@bloodyowl/boxed";
import { MessageErrorCode } from "@insta/contracts/errors";
import { messageInputSchema, wireIdSchema } from "@insta/contracts/messages";
import { conversationIdSchema } from "../../../contracts/schema";
import type { QueuedMessage, QueueError } from "../domain/types";
import type { Queue } from "../ports/queue";
/** Валидирует текст и идентификаторы, создаёт устойчивую идентичность операции и сохраняет запись; исключение persistence возвращает как явную ошибку. */
export const enqueue = async (
  input: Readonly<{
    ownerId: string;
    conversationId: string;
    text: string;
    authGeneration: string;
  }>,
  {
    queue,
    clock,
    uuid,
  }: Readonly<{ queue: Queue; clock: () => number; uuid: () => string }>,
): Promise<Result<QueuedMessage, QueueError>> => {
  const payload = messageInputSchema.safeParse(
    { text: input.text },
    { jitless: true },
  );
  if (
    !wireIdSchema.safeParse(input.authGeneration, { jitless: true }).success ||
    !payload.success ||
    !wireIdSchema.safeParse(input.ownerId, { jitless: true }).success ||
    !conversationIdSchema.safeParse(input.conversationId, { jitless: true })
      .success
  )
    return Result.Error(MessageErrorCode.InvalidMessage);
  const record: QueuedMessage = {
    ownerId: input.ownerId,
    conversationId: input.conversationId,
    text: payload.data.text,
    key: uuid(),
    clientMessageId: uuid(),
    operationId: uuid(),
    createdAt: clock(),
    attempts: 0,
    nextAttemptAt: 0,
    lastAuthGeneration: input.authGeneration,
    revision: 0,
    manualAttempt: false,
    state: "queued",
    needsConfirmation: false,
  };
  try {
    return await queue.insert(record);
  } catch {
    return Result.Error("PERSISTENCE_FAILED");
  }
};
