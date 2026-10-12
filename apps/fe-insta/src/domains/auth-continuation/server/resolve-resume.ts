import { ContinuationErrorCode } from "@insta/contracts/errors";
import { resolveResume } from "../use-cases/resolve-resume";
import { readContinuationContext } from "./context";
import { intentFailure, intentReply } from "./reply";
import type { ContinuationDependencies, ContinuationRequest } from "./types";
/**
 * Требует существующий browser-контекст, actor и intentId перед разрешением продолжения;
 * возвращает проверенную цель либо код отказа сценария.
 */
export const resumeRequest = async (
  input: ContinuationRequest,
  dependencies: ContinuationDependencies,
) => {
  const now = Date.now();
  const context = await readContinuationContext({
    ...input,
    key: dependencies.key,
    now,
  });
  if (!context || !dependencies.actor || !input.intentId)
    return intentFailure(ContinuationErrorCode.IntentUnavailable);
  const result = await resolveResume(
    { intentId: input.intentId, context, actor: dependencies.actor, now },
    dependencies,
  );
  return result.isOk()
    ? intentReply(result.get())
    : intentFailure(result.getError());
};
