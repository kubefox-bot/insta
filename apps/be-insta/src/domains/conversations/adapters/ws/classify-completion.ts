import type {
  CommandCompletion,
  RealtimeAck,
} from "../../../../lib/realtime/index";
import { commandCompletion } from "./conts";
/**
 * Переводит protocol ACK в outcome наблюдения команды, сохраняя error code для каталога
 * классификации.
 */
export const classifyCompletion = (ack: RealtimeAck): CommandCompletion =>
  ack.ok
    ? commandCompletion.success
    : {
        code: ack.error.code,
        outcome: commandCompletion.failureOutcomes[ack.error.code],
      };
