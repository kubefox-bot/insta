import { expect, test } from "bun:test";
import { createServer, type Socket } from "node:net";
import { waitForEgress } from "../../fixtures/browser-egress/ready";

test("container ready log cannot release browser before the owned published CONNECT endpoint responds; probe releases its socket", async () => {
  const connected = Promise.withResolvers<Socket>();
  const closed = Promise.withResolvers<void>();
  const server = createServer((socket) => {
    socket.on("error", () => {});
    socket.once("close", () => closed.resolve());
    socket.once("data", () => connected.resolve(socket));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing owned listener");
  let completed = false;
  const ready = waitForEgress({
    port: address.port,
    readReady: async () => true,
  }).then(() => {
    completed = true;
  });
  try {
    await Promise.race([connected.promise, ready]);
    expect(completed).toBe(false);
    const socket = await connected.promise;
    socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    await ready;
    await closed.promise;
    expect(completed).toBe(true);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
