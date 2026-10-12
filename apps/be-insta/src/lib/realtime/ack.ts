import {
  realtimeKinds,
  realtimeProtocolVersion,
} from "@insta/contracts/realtime";
import type { RealtimeAck } from "./types";
/** Формирует отрицательный ACK текущей версии протокола с корреляцией исходной команды. */
export const createFailureAck = ({
  code,
  message,
  meta,
}: Readonly<{
  code: Extract<RealtimeAck, { ok: false }>["error"]["code"];
  message: string;
  meta: RealtimeAck["meta"];
}>): RealtimeAck => ({
  version: realtimeProtocolVersion,
  kind: realtimeKinds.ack,
  ok: false,
  error: { code, message },
  meta,
});
