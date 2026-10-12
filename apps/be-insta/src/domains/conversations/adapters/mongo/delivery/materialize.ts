import type { DeliveryPayload } from "../../../ports/delivery/types";
import { materializeMessage } from "./materialize/message";
import { materializeNotification } from "./materialize/notification";
import { materializeReceipt } from "./materialize/receipt";
import type { MaterializeInput } from "./materialize/types";
/** Направляет материализацию владельцу конкретного persisted source, сохраняя ошибки чтения. */
export const materializeDelivery = (
  input: MaterializeInput,
): Promise<DeliveryPayload> => {
  switch (input.event.source.kind) {
    case "notification":
      return materializeNotification(input);
    case "message":
      return materializeMessage(input);
    case "receipt":
      return materializeReceipt(input);
    default: {
      const impossible: never = input.event.source.kind;
      throw new Error(`Unknown delivery source ${impossible}`);
    }
  }
};
