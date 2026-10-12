import type { StoredDelivery } from "../../../../ports/delivery/types";
import type { RecoveryTarget } from "./types";
/** Сверяет committed source manifest целиком; mutable membership проверяет delivery use case перед отправкой. */
export const matchesUnreadRecoveryTarget = (
  event: StoredDelivery,
  targets: readonly RecoveryTarget[] | undefined,
) =>
  event.streamId.startsWith("unread:") &&
  targets?.some(
    (target) =>
      target.streamId === event.streamId &&
      target.epoch === event.epoch &&
      target.cursor === event.cursor &&
      target.expiresAt.getTime() === event.expiresAt,
  ) === true;
