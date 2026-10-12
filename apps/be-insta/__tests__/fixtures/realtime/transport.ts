import { createServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { io } from "socket.io-client";
import { waitUntil } from "../../../../../__tests__/fixtures/barrier";

/** Владеет настоящей SDK-парой; setup ждёт законченный handshake, teardown освобождает оба конца даже после ошибки. */
export const createSdkTransport = async () => {
  await using resources = new AsyncDisposableStack();
  const http = createServer();
  const server = new Server(http, { transports: ["websocket"] });
  resources.defer(
    () => new Promise<void>((resolve) => server.close(() => resolve())),
  );
  const connected = Promise.withResolvers<Socket>();
  server.on("connection", connected.resolve);
  await new Promise<void>((resolve, reject) => {
    http.once("error", reject);
    http.listen(0, "127.0.0.1", resolve);
  });
  const address = http.address();
  if (!address || typeof address === "string") throw new Error("No listener");
  const client = io(`http://127.0.0.1:${address.port}`, {
    transports: ["websocket"],
    reconnection: false,
    timeout: 2000,
  });
  resources.defer(() => {
    client.disconnect();
  });
  client.once("connect_error", connected.reject);
  const socket = await connected.promise;
  await waitUntil({
    timeoutMs: 2000,
    check: async () => client.connected && socket.conn.transport.writable,
  });
  const lifetime = resources.move();
  return {
    socket,
    client,
    [Symbol.asyncDispose]: () => lifetime.disposeAsync(),
  };
};
