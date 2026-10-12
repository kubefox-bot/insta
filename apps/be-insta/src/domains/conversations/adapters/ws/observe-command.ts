import { RealtimeErrorCode } from "@insta/contracts/errors";
import {
  commandSchema,
  realtimeChannels,
  realtimeProtocolVersion,
} from "@insta/contracts/realtime";
import type { z } from "zod";
import type { RealtimeAck } from "../../../../lib/realtime/index";
import { createFailureAck } from "../../../../lib/realtime/index";
import { classifyCompletion } from "./classify-completion";
import { commandCompletion } from "./conts";
import { executeCommand } from "./subscribe";
import type { GatewayDependencies, Recipient } from "./types";

/**
 * Расходует quota сессии до исполнения даже неподдерживаемой команды;
 * quota/validation/execution отказы возвращает как безопасный ACK.
 */
const executeAdmitted = async ({
  command,
  recipient,
  dependencies,
  meta,
  signal,
  unsupportedVersion,
}: Readonly<{
  unsupportedVersion: boolean;
  command: z.ZodSafeParseResult<z.infer<typeof commandSchema>>;
  recipient: Recipient;
  dependencies: GatewayDependencies;
  meta: RealtimeAck["meta"];
  signal: AbortSignal;
}>): Promise<RealtimeAck> => {
  const budget = await dependencies.quota.consume(
    recipient.actor.backendSessionId,
  );
  if (budget.isError())
    return createFailureAck({
      message: "Command unavailable",
      code: RealtimeErrorCode.ServiceUnavailable,
      meta,
    });
  if (budget.get() === "limited")
    return createFailureAck({
      message: "Command unavailable",
      code: RealtimeErrorCode.RateLimited,
      meta,
    });
  if (!command.success)
    return createFailureAck({
      message: "Command unavailable",
      code: unsupportedVersion
        ? RealtimeErrorCode.ProtocolUnsupported
        : RealtimeErrorCode.UnsupportedCommand,
      meta,
    });
  try {
    return await executeCommand({
      recipient,
      command: command.data,
      dependencies,
      meta,
      signal,
    });
  } catch {
    return createFailureAck({
      message: "Command unavailable",
      code: RealtimeErrorCode.ServiceUnavailable,
      meta,
    });
  }
};
/**
 * Валидирует payload только command-канала и запускает наблюдаемое исполнение с
 * operationId, если команда валидна.
 */
export const observeCommand = ({
  eventName,
  payload,
  recipient,
  dependencies,
  signal,
}: Readonly<{
  eventName: string;
  payload: unknown;
  recipient: Recipient;
  dependencies: GatewayDependencies;
  signal: AbortSignal;
}>) => {
  const command = commandSchema.safeParse(
    eventName === realtimeChannels.command ? payload : undefined,
  );
  const operationId = command.success
    ? command.data.meta.operationId
    : undefined;
  return dependencies.observe({
    type: command.success
      ? command.data.type
      : commandCompletion.unsupportedOperation,
    classify: classifyCompletion,
    ...(operationId ? { operationId } : {}),
    /**
     * Передаёт созданную observability-корреляцию в admission и исполнение команды с
     * исходным сигналом отмены.
     */
    execute: (meta) =>
      executeAdmitted({
        command,
        recipient,
        dependencies,
        signal,
        meta,
        unsupportedVersion:
          typeof payload === "object" &&
          payload !== null &&
          "version" in payload &&
          payload.version !== realtimeProtocolVersion,
      }),
  });
};
