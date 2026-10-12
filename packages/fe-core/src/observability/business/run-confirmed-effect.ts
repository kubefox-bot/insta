import { Result } from "@bloodyowl/boxed";
import { logFields } from "../contracts/conts";
import { canonicalUuid4 } from "../identifiers/canonical-uuid4";
import { emitDiagnostic } from "./emit-diagnostic";
import type { BusinessObserverOptions } from "./types";

/** Ожидает необязательный эффект после подтверждения; его отказ сообщает как FRONTEND_UI_EFFECT_FAILED с допустимым operation ID, не выбрасывая ошибку эффекта вызывающему коду. */
export const runConfirmedEffect = async (
  effect: (() => unknown) | undefined,
  operation: string,
  operationId: string | undefined,
  emit: BusinessObserverOptions["emit"],
): Promise<void> => {
  if (!effect) return;
  const invoked = Result.fromExecution(effect);
  const result = invoked.isError()
    ? invoked
    : await Result.fromPromise(Promise.resolve(invoked.get()));
  if (result.isOk()) return;
  const accepted = canonicalUuid4(operationId);
  emitDiagnostic(emit, {
    type: "frontend_failure",
    operation,
    ...(accepted ? { [logFields.operationId]: accepted } : {}),
    phase: "post_confirmation",
    code: "FRONTEND_UI_EFFECT_FAILED",
    error: result.getError(),
  });
};
