import { Result } from "@bloodyowl/boxed";
import { submissionPayload } from "../../../domain/submission";
import type { SupportFailure, SupportReceipt } from "../../../domain/types";
import type { SupportFormTransport } from "../../ports/interfaces";
import type { SupportFormInput } from "../../types";
import type { createFormState } from "./lib/state";
/**
 * Отправляет только разрешённую попытку с готовым scope; повтор сохраняет прежний payload, а
 * unknown и последующие повторы удерживают предупреждение о возможном сохранении.
 */
export const submitForm = async ({
  state,
  transport,
  input: { comment, issue },
}: Readonly<{
  state: ReturnType<typeof createFormState>;
  transport: SupportFormTransport;
  input: SupportFormInput;
}>) => {
  const current = state.read();
  if (
    state.signal.aborted ||
    !current.canSubmit ||
    current.scope.kind !== "ready"
  )
    return;
  const payload = submissionPayload({
    attempt: current.attempt,
    scopeId: current.scope.scopeId,
    idempotencyKey: current.scope.idempotencyKey,
    comment,
    issue,
  });
  const alreadyUncertain =
    current.attempt.kind === "failed" && current.attempt.uncertain;
  state.publish({
    scope: current.scope,
    attempt: { kind: "sending", payload, uncertain: alreadyUncertain },
  });
  const result = await transport
    .submitSupport(payload, state.signal)
    .catch(
      (): Result<SupportReceipt, SupportFailure> => Result.Error("unknown"),
    );
  state.publish({
    scope: current.scope,
    attempt: result.isOk()
      ? { kind: "saved", payload, receipt: result.get() }
      : {
          kind: "failed",
          payload,
          failure: result.getError(),
          uncertain: alreadyUncertain || result.getError() === "unknown",
        },
  });
};
