import { ContinuationErrorCode } from "@insta/contracts/errors";
import { acceptsCookieMutation } from "../../../lib/http/server/index";
import type { Identity } from "../ports/identity";
import { intentFailure } from "./reply";
import { continuationRequest } from "./transport";
import type { ContinuationDependencies, ContinuationRequest } from "./types";
/**
 * Проверяет origin cookie-операции, для create/resume читает identity и для create дедлайн
 * регистрации; cancel разрешает по browser-контексту без чтения identity.
 */
export const authorizeContinuationRequest = async (
  input: ContinuationRequest,
  dependencies: Omit<
    ContinuationDependencies,
    "actor" | "registrationExpiresAt"
  > &
    Readonly<{ identity: Identity }>,
) => {
  if (!acceptsCookieMutation(input)) return new Response(null, { status: 403 });
  if (input.operation === "cancel")
    return continuationRequest(input, dependencies);
  const session = await dependencies.identity.read();
  if (session.status === "unavailable")
    return intentFailure(ContinuationErrorCode.IntentUnavailable);
  const registrationExpiresAt =
    input.operation === "create"
      ? await dependencies.identity.registrationDeadline()
      : undefined;
  return continuationRequest(input, {
    ...dependencies,
    actor:
      session.status === "authenticated"
        ? (session.actor ?? undefined)
        : undefined,
    registrationExpiresAt,
  });
};
