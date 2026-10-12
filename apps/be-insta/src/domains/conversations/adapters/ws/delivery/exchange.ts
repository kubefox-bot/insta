import type { Socket } from "socket.io";
/** Владеет реальным SDK timeout до settlement даже после abort/disconnect. */
export const exchangeDelivery = async ({
  socket,
  ackTimeoutMs,
  channel,
  payload,
  signal,
}: Readonly<{
  socket: Socket;
  ackTimeoutMs: number;
  channel: string;
  payload: unknown;
  signal: AbortSignal;
}>) => {
  if (signal.aborted || !socket.connected) return { kind: "closed" as const };
  // SDK ACK timeout does not remove Engine.IO buffered packets; the journal owns retries.
  if (!socket.conn.transport.writable) return { kind: "timeout" as const };
  try {
    const reply: unknown = await socket
      .timeout(ackTimeoutMs)
      .emitWithAck(channel, payload);
    if (signal.aborted || !socket.connected) return { kind: "closed" as const };
    return { kind: "received" as const, payload: reply };
  } catch {
    return {
      kind:
        signal.aborted || !socket.connected
          ? ("closed" as const)
          : ("timeout" as const),
    };
  }
};
