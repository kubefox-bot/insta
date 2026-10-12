import { Result } from "@bloodyowl/boxed";
import { ContinuationErrorCode } from "@insta/contracts/errors";
import { intentLifetimeMs } from "../domain/conts";
import type { Actor, IntentError, IntentInput } from "../domain/types";
import type { Intents } from "../ports/intents";
/**
 * Создаёт pending-intent с привязкой к контексту и возможному пользователю, ограничивая срок
 * дедлайном регистрации; отказ хранилища возвращает intent_unavailable.
 */
export const createIntent = async (
  {
    input,
    context,
    actor,
    now,
    registrationExpiresAt,
  }: Readonly<{
    input: IntentInput;
    context: string;
    actor?: Actor;
    now: number;
    registrationExpiresAt?: number;
  }>,
  { intents, uuid }: Readonly<{ intents: Intents; uuid: () => string }>,
): Promise<
  Result<Readonly<{ intentId: string; expiresAt: number }>, IntentError>
> => {
  const expiresAt = Math.min(
    now + intentLifetimeMs,
    registrationExpiresAt ?? Infinity,
  );
  if (
    !context ||
    expiresAt <= now ||
    (input.type !== "create_story" &&
      input.type !== "resume_story" &&
      (!input.recipientId || !/^[A-Za-z0-9_-]+$/.test(input.recipientId)))
  )
    return Result.Error(ContinuationErrorCode.IntentInvalid);
  const intentId = uuid();
  try {
    const created = await intents.create({
      ...input,
      intentId,
      context,
      expectedUserId: actor?.userId,
      createdAt: now,
      expiresAt,
      state: "pending",
    });
    return created
      ? Result.Ok({ intentId, expiresAt })
      : Result.Error(ContinuationErrorCode.IntentUnavailable);
  } catch {
    return Result.Error(ContinuationErrorCode.IntentUnavailable);
  }
};
