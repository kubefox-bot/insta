import { io } from "socket.io-client";
/** Получает одноразовый ticket и подключает WS-only fixture; вызывающий владеет disconnect. */
export const connectRealtimeFixture = async (
  url: string,
  accessToken: string,
) => {
  const response = await fetch(`${url}/v1/auth/ws-ticket`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  if (!response.ok)
    throw new Error(`Fixture ticket rejected: ${response.status}`);
  const socket = io(url, {
    path: "/event",
    transports: ["websocket"],
    auth: { ticket: (await response.json()).data.ticket },
    extraHeaders: { origin: "https://localhost" },
    reconnection: false,
    forceNew: true,
  });
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("connect_error", reject);
    });
    return socket;
  } catch (error) {
    socket.disconnect();
    throw error;
  }
};
