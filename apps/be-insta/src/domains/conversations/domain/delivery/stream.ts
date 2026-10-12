import type { DeliveryStream } from "../../ports/delivery/types";
/** Разбирает внутренний stream ID без изменения идентификатора после первого разделителя. */
export const deliveryStream = (streamId: string): DeliveryStream => {
  const separator = streamId.indexOf(":");
  const kind = streamId.slice(0, separator);
  const id = streamId.slice(separator + 1);
  if (
    (kind !== "conversation" && kind !== "unread" && kind !== "stories") ||
    !id
  )
    throw new Error("Invalid delivery stream");
  return { kind, id };
};
