import { Result } from "@bloodyowl/boxed";
import { ContinuationErrorCode } from "@insta/contracts/errors";
import {
  availableIntent,
  replayTarget,
  safeTarget,
  supportedResume,
} from "../domain/intent";
import type { Actor, IntentError, ResumeTarget } from "../domain/types";
import type { Intents } from "../ports/intents";
import type { Targets } from "../ports/targets";
/**
 * Разрешает цель после проверки контекста, срока и actor, затем атомарно фиксирует consumed;
 * повтор требует той же identity и цели, а конфликты и сбои дают intent_unavailable. Отправка
 * сообщения или публикация видео здесь не выполняется.
 */
export const resolveResume = async (
  {
    intentId,
    context,
    actor,
    now,
  }: Readonly<{ intentId: string; context: string; actor: Actor; now: number }>,
  { intents, targets }: Readonly<{ intents: Intents; targets: Targets }>,
): Promise<Result<ResumeTarget, IntentError>> => {
  try {
    const intent = await intents.find(intentId);
    if (
      !intent ||
      !availableIntent({ intent, context, actor, now }) ||
      !supportedResume(intent)
    )
      return Result.Error(ContinuationErrorCode.IntentUnavailable);
    const target = await targets.resolve({ intent, actor });
    if (
      !target ||
      !safeTarget(target) ||
      target.type !== intent.type ||
      ("operationId" in target && target.operationId !== intent.operationId)
    )
      return Result.Error(ContinuationErrorCode.IntentUnavailable);
    if (intent.state === "consumed") {
      const replay = replayTarget({ intent, actor, target });
      return replay
        ? Result.Ok(replay)
        : Result.Error(ContinuationErrorCode.IntentUnavailable);
    }
    const consumed = await intents.compare({
      previous: intent,
      next: {
        ...intent,
        state: "consumed",
        actorId: actor.userId,
        actorGeneration: actor.generation,
        target,
      },
    });
    return consumed
      ? Result.Ok(target)
      : Result.Error(ContinuationErrorCode.IntentUnavailable);
  } catch {
    return Result.Error(ContinuationErrorCode.IntentUnavailable);
  }
};
