import { Result } from "@bloodyowl/boxed";
import { CommonErrorCode } from "@insta/contracts/errors";
import {
  type DeliveryPosition,
  RealtimeErrorCode,
} from "@insta/contracts/realtime";
import type {
  DeliveryAdmissionCode,
  DeliveryAdmissionPorts,
  DeliverySelection,
} from "../../ports/delivery/types";
/** Проверяет принадлежность, epoch, canonical upper bound и retained floor до запуска reader. */
export const validateDeliveryPosition = async (
  input: DeliverySelection & Readonly<{ after: DeliveryPosition }>,
  ports: DeliveryAdmissionPorts,
): Promise<Result<void, DeliveryAdmissionCode>> => {
  if (input.after.streamId !== `${input.target.kind}:${input.target.id}`)
    return Result.Error(CommonErrorCode.Forbidden);
  const range = await ports.journal.range({
    stream: input.target,
    nowMs: ports.clock(),
    signal: input.signal,
  });
  input.signal.throwIfAborted();
  if (
    range.kind === "resync-required" ||
    input.after.epoch !== range.head.epoch ||
    input.after.cursor < range.after.cursor ||
    input.after.cursor > range.head.cursor
  )
    return Result.Error(RealtimeErrorCode.ResyncRequired);
  return Result.Ok(undefined);
};
