import { Result } from "@bloodyowl/boxed";
import { ContinuationErrorCode } from "@insta/contracts/errors";
import { cancellableIntent } from "../domain/intent";
import type { Actor, IntentError } from "../domain/types";
import type { Intents } from "../ports/intents";
/**
 * Находит живой pending-intent того же контекста и атомарно заменяет его на cancelled;
 * отсутствие, конфликт сравнения и отказ хранилища дают intent_unavailable.
 */
export const cancelIntent = async (
  {
    intentId,
    context,
    now,
  }: Readonly<{
    intentId: string;
    context: string;
    actor?: Actor;
    now: number;
  }>,
  { intents }: Readonly<{ intents: Intents }>,
): Promise<Result<void, IntentError>> => {
  try {
    const intent = await intents.find(intentId);
    if (!intent || !cancellableIntent({ intent, context, now }))
      return Result.Error(ContinuationErrorCode.IntentUnavailable);
    return (await intents.compare({
      previous: intent,
      next: { ...intent, state: "cancelled" },
    }))
      ? Result.Ok(undefined)
      : Result.Error(ContinuationErrorCode.IntentUnavailable);
  } catch {
    return Result.Error(ContinuationErrorCode.IntentUnavailable);
  }
};
