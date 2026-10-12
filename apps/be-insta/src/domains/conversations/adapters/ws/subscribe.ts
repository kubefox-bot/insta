import { AuthErrorCode } from "@insta/contracts/errors";
import type {
  RealtimeAck,
  RealtimeCommand,
} from "../../../../lib/realtime/index";
import {
  createFailureAck,
  withPublicationSignal,
} from "../../../../lib/realtime/index";
import { executeSubscription } from "./execute-subscription";
import type { GatewayDependencies, Recipient } from "./types";
/** Проверяет сессию до сериализованной команды; provider error сохраняет собственный исход. */
export const executeCommand = async ({
  recipient,
  command,
  dependencies,
  meta,
  signal,
}: Readonly<{
  recipient: Recipient;
  command: RealtimeCommand;
  dependencies: GatewayDependencies;
  meta: RealtimeAck["meta"];
  signal?: AbortSignal;
}>): Promise<RealtimeAck> =>
  withPublicationSignal({
    ...(signal ? { signal } : {}),
    execute: async (signal) => {
      const current = await dependencies.authorize({
        actor: recipient.actor,
        signal,
      });
      if (current.isError()) {
        recipient.socket.disconnect(true);
        return createFailureAck({
          code: AuthErrorCode.SessionRevoked,
          message: "Session unavailable",
          meta,
        });
      }
      return executeSubscription({ recipient, command, meta, signal });
    },
  });
