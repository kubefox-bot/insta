import { io } from "socket.io-client";
import { z } from "zod";
import { connectionPolicy, unauthorizedStatus } from "./conts";
import { listenForDelivery } from "./delivery/listen";
import type { ConnectionDependencies } from "./types";

const failureSchema = z.object({
  data: z.object({ status: z.number() }).optional(),
});
/**
 * Создаёт отдельный Socket.IO client без автоподключения и внутренних reconnect.
 * События проходят только для активного поколения; отказ авторизации отделён от
 * повторяемого сбоя. Владелец соединения запускает client и снимает listeners при
 * закрытии.
 */
export const createRealtimeTransport = ({
  ticket,
  dependencies,
  active,
  connected,
  retry,
  unauthorized,
  protocolError,
  track,
}: Readonly<{
  ticket: string;
  dependencies: ConnectionDependencies;
  active: () => boolean;
  connected: () => void;
  retry: () => void;
  unauthorized: () => void;
  protocolError: () => void;
  track: (operation: Promise<void>) => void;
}>) => {
  const client = (dependencies.createSocket ?? io)(dependencies.url, {
    path: connectionPolicy.path,
    auth: { ticket },
    autoConnect: false,
    reconnection: false,
    transports: ["websocket"],
    retries: 0,
    forceNew: true,
    timeout: connectionPolicy.connectionTimeoutMs,
  });
  client.on("connect", () => {
    if (active()) connected();
  });
  client.on("connect_error", (error: unknown) => {
    if (!active()) return;
    const failure = failureSchema.safeParse(error, { jitless: true });
    if (failure.success && failure.data.data?.status === unauthorizedStatus)
      unauthorized();
    else retry();
  });
  client.on("disconnect", () => {
    if (!active()) return;
    dependencies.observe({ kind: "disconnected" });
    retry();
  });
  listenForDelivery({
    client,
    receiver: dependencies.delivery,
    active,
    protocolError,
    track,
  });
  return client;
};
