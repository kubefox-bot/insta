import type { Server } from "socket.io";
import { realtimePolicy } from "./conts";

/** Проверяет текстовый формат и размер UTF-8 до декодирования Socket.IO; бинарные команды не допускаются. */
const acceptsPacketPayload = (payload: unknown) =>
  typeof payload === "string" &&
  Buffer.byteLength(payload, "utf8") <= realtimePolicy.maxPayloadBytes;
/** Закрывает соединение при недопустимом сыром пакете; компенсирует отсутствие maxPayload в совместимости Bun ws. */
export const registerPacketAdmission = (engine: Server["engine"]) => {
  // Bun's ws compatibility currently ignores ws.Server.maxPayload. Inspect each
  // message before Socket.IO decode, including auth; commands cannot use binary.
  engine.on("connection", (connection) => {
    connection.on(
      "packet",
      (packet: Readonly<{ type: string; data?: unknown }>) => {
        if (packet.type === "message" && !acceptsPacketPayload(packet.data))
          connection.close(true);
      },
    );
  });
};
