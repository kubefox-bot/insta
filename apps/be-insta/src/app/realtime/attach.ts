import type { Server } from "node:http";
import { logFields } from "@insta/fe-core/observability/contracts";
import {
  createConversationGateway,
  startRealtimeWorker,
  startReceiptWorker,
} from "../../domains/conversations/server/index";
import { authorizeActorSession } from "../../domains/users/index";
import type { RuntimeObservability } from "../../lib/observability/index";
import { createCommandObserver } from "../../lib/realtime/index";
import type { RuntimeDependencies } from "../composition/runtime/index";
import { realtimeDiagnostics } from "./conts";
/** Подключает conversation gateway и два outbox worker при наличии auth/chat/origin; возвращённый close владеет их остановкой. */
export const attachRealtime = ({
  server,
  dependencies,
  observability,
}: Readonly<{
  server: Server;
  dependencies: RuntimeDependencies;
  observability?: RuntimeObservability;
}>) => {
  const users = dependencies.users;
  const chat = dependencies.chat;
  if (!users?.tickets || !chat || !dependencies.realtimeOrigin)
    return undefined;
  const gateway = createConversationGateway({
    server,
    origin: dependencies.realtimeOrigin,
    tickets: users.tickets,
    /** Проверяет живую auth-сессию через публичный use case users перед realtime-действием. */
    authorize: (input) => authorizeActorSession(input, users.auth),
    ...chat.realtime,
    observe: createCommandObserver({
      ...(observability ? { observability } : {}),
      /** Создаёт независимый requestId для наблюдения каждой realtime-команды. */
      uuid: () => crypto.randomUUID(),
    }),
  });
  const worker = startRealtimeWorker({
    outbox: chat.realtime.outbox,
    publish: chat.realtime.publishers.message,
    maintenance: chat.realtime.maintenance,
    /** Сообщает о недоступности message outbox без содержания сообщений и исходной ошибки провайдера. */
    onError: () =>
      observability?.adapter.logger.warn({
        [logFields.eventType]: "diagnostic",
        diagnostic: { code: realtimeDiagnostics.outboxUnavailable },
      }),
  });
  const receipts = startReceiptWorker({
    outbox: chat.receiptOutbox,
    publish: chat.realtime.publishers.receipt,
    /** Сообщает о недоступности receipt outbox безопасным диагностическим кодом. */
    onError: () =>
      observability?.adapter.logger.warn({
        [logFields.eventType]: "diagnostic",
        diagnostic: { code: realtimeDiagnostics.receiptOutboxUnavailable },
      }),
  });
  return {
    /** Ждёт остановки обоих realtime worker и gateway, затем передаёт первую ошибку закрытия. */
    close: async () => {
      const results = await Promise.allSettled([
        worker.close(),
        receipts.close(),
        gateway.close(),
      ]);
      const readers = await Promise.allSettled([chat.realtime.streams.close()]);
      const failure = [...results, ...readers].find(
        (result) => result.status === "rejected",
      );
      if (failure?.status === "rejected") throw failure.reason;
    },
  };
};
