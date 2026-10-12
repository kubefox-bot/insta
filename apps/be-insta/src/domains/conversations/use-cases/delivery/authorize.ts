import { Result } from "@bloodyowl/boxed";
import { AuthErrorCode, CommonErrorCode } from "@insta/contracts/errors";
import { storiesFeedStream } from "@insta/contracts/realtime";
import type {
  DeliveryAccess,
  DeliveryAdmissionCode,
  DeliverySelection,
} from "../../ports/delivery/types";
/** Повторно проверяет actor и membership перед каждой попыткой; provider exceptions не становятся session denial. */
export const authorizeDelivery = async (
  input: DeliverySelection,
  ports: DeliveryAccess,
): Promise<Result<void, DeliveryAdmissionCode>> => {
  input.signal.throwIfAborted();
  if (ports.clock() >= input.actor.accessExpiresAt)
    return Result.Error(AuthErrorCode.SessionRevoked);
  const current = await ports.authorize({
    actor: input.actor,
    signal: input.signal,
  });
  input.signal.throwIfAborted();
  if (current.isError()) return Result.Error(AuthErrorCode.SessionRevoked);
  const actor = current.get();
  if (
    actor.userId !== input.actor.userId ||
    actor.backendSessionId !== input.actor.backendSessionId ||
    actor.accessExpiresAt !== input.actor.accessExpiresAt
  )
    return Result.Error(AuthErrorCode.SessionRevoked);
  if (input.target.kind === "stories")
    return input.target.id === storiesFeedStream.id
      ? Result.Ok(undefined)
      : Result.Error(CommonErrorCode.Forbidden);
  const permitted =
    input.target.kind === "unread"
      ? input.target.id === actor.userId
      : await ports.membership.permits({
          actorId: actor.userId,
          conversationId: input.target.id,
          signal: input.signal,
        });
  input.signal.throwIfAborted();
  return permitted
    ? Result.Ok(undefined)
    : Result.Error(CommonErrorCode.Forbidden);
};
