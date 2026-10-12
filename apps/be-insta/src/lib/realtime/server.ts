import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { realtimePolicy } from "./conts";
import { registerPacketAdmission } from "./inspect-packet";
import { acceptsRealtimeOrigin } from "./origin";
/** Подключает Socket.IO к заимствованному HTTP-серверу; владелец возвращённого сервера отвечает за закрытие. */
export const createRealtimeServer = ({
  server,
  origin,
  accepting,
}: Readonly<{
  server: HttpServer;
  origin: string;
  accepting: () => boolean;
}>) => {
  const io = new Server(server, {
    path: realtimePolicy.path,
    transports: ["websocket"],
    maxHttpBufferSize: realtimePolicy.maxPayloadBytes,
    pingInterval: realtimePolicy.pingIntervalMs,
    pingTimeout: realtimePolicy.pingTimeoutMs,
    /** Разрешает handshake только пока приложение принимает соединения и origin удовлетворяет серверной политике. */
    allowRequest: (request, accept) =>
      accept(
        null,
        accepting() &&
          acceptsRealtimeOrigin({
            headers: request.headers,
            origin,
          }),
      ),
  });
  registerPacketAdmission(io.engine);
  return io;
};
