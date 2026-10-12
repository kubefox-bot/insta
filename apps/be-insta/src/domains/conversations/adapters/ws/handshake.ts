import {
  CommonErrorCode,
  RealtimeErrorCode,
  SessionErrorCode,
} from "@insta/contracts/errors";
import { HttpStatus } from "@nestjs/common";
import type { Socket } from "socket.io";
import { z } from "zod";
import {
  acceptsRealtimeOrigin,
  realtimePolicy,
  withPublicationSignal,
} from "../../../../lib/realtime/index";
import { createDeliveryLifetime } from "./delivery/lifetime";
import type { GatewayDependencies, Recipient } from "./types";

const handshakeSchema = z.strictObject({ ticket: z.uuid() });
class HandshakeRejection extends Error {
  /**
   * Сохраняет ожидаемый protocol code и HTTP status отказа handshake без раскрытия
   * деталей авторизации.
   */
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super("Realtime authorization rejected");
  }
}
/**
 * Проверяет origin и одноразовый ticket, повторно авторизует actor и ограничивает sockets
 * на session; регистрирует recipient с удалением из реестров при закрытии транспорта.
 */
export const authenticateSocket = async ({
  socket,
  dependencies,
  recipients,
  sessions,
}: Readonly<{
  socket: Socket;
  dependencies: GatewayDependencies;
  recipients: Map<string, Recipient>;
  sessions: Map<string, Set<string>>;
}>) => {
  const input = handshakeSchema.safeParse(socket.handshake.auth);
  if (
    !input.success ||
    !acceptsRealtimeOrigin({
      headers: socket.handshake.headers,
      origin: dependencies.origin,
    })
  )
    throw new HandshakeRejection(
      HttpStatus.FORBIDDEN,
      CommonErrorCode.Forbidden,
    );
  const actor = await dependencies.tickets.consume({
    ticket: input.data.ticket,
    now: Date.now(),
  });
  if (!actor)
    throw new HandshakeRejection(
      HttpStatus.UNAUTHORIZED,
      SessionErrorCode.SessionRequired,
    );
  await withPublicationSignal({
    /**
     * Повторно проверяет каноническую сессию потреблённого ticket с ограниченным lifetime
     * signal; отказ превращает в ожидаемое отклонение handshake.
     */
    execute: async (signal) => {
      const current = await dependencies.authorize({ actor, signal });
      if (current.isError())
        throw new HandshakeRejection(
          HttpStatus.UNAUTHORIZED,
          SessionErrorCode.SessionRequired,
        );
    },
  });
  if (socket.conn.readyState !== "open") throw new Error("Connection closed");
  const sockets = sessions.get(actor.backendSessionId) ?? new Set<string>();
  if (sockets.size >= realtimePolicy.socketsPerSession)
    throw new HandshakeRejection(
      HttpStatus.TOO_MANY_REQUESTS,
      RealtimeErrorCode.RateLimited,
    );
  sockets.add(socket.id);
  sessions.set(actor.backendSessionId, sockets);
  recipients.set(socket.id, {
    socket,
    actor,
    deliveries: createDeliveryLifetime({ actor, socket, dependencies }),
  });
  socket.conn.once("close", () => {
    recipients.delete(socket.id);
    sockets.delete(socket.id);
    if (!sockets.size) sessions.delete(actor.backendSessionId);
  });
};
/**
 * Создаёт безопасную ошибку Socket.IO handshake с известным кодом/статусом;
 * непредвиденный сбой скрывает за ServiceUnavailable.
 */
export const handshakeError = (failure: unknown) =>
  Object.assign(new Error("Realtime authorization unavailable"), {
    data:
      failure instanceof HandshakeRejection
        ? { code: failure.code, status: failure.status }
        : {
            code: RealtimeErrorCode.ServiceUnavailable,
            status: HttpStatus.SERVICE_UNAVAILABLE,
          },
  });
