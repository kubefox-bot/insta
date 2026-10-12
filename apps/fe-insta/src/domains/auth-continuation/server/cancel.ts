import { ContinuationErrorCode } from "@insta/contracts/errors";
import { cancelIntent } from "../use-cases/cancel";
import { readContinuationContext } from "./context";
import { intentFailure, intentReply } from "./reply";
import type { ContinuationDependencies, ContinuationRequest } from "./types";
/**
 * Читает существующий защищённый контекст и отменяет указанный intent; без контекста или
 * идентификатора возвращает недоступность, не создавая новую cookie.
 */
export const cancelRequest = async (
  input: ContinuationRequest,
  dependencies: ContinuationDependencies,
) => {
  const now = Date.now();
  const context = await readContinuationContext({
    ...input,
    key: dependencies.key,
    now,
  });
  if (!context || !input.intentId)
    return intentFailure(ContinuationErrorCode.IntentUnavailable);
  const result = await cancelIntent(
    { intentId: input.intentId, context, actor: dependencies.actor, now },
    dependencies,
  );
  return result.isOk()
    ? intentReply({ cancelled: true })
    : intentFailure(result.getError());
};
