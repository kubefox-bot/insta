import { createConnection, createServer, type Socket } from "node:net";
import { egressPolicy } from "./conts";
import type { EgressConnection } from "./types";
export const startEgressServer = async ({
  port = egressPolicy.port,
  connect = () =>
    createConnection({
      host: egressPolicy.upstreamHost,
      port: egressPolicy.upstreamPort,
    }),
}: Readonly<{ port?: number; connect?: EgressConnection }> = {}) => {
  const sockets = new Set<Socket>();
  const server = createServer((client) => {
    sockets.add(client);
    client.on("close", () => sockets.delete(client));
    client.on("error", () => client.destroy());
    client.setTimeout(egressPolicy.headerDeadlineMs, () => client.destroy());
    let header = Buffer.alloc(0);
    const readHeader = (chunk: Buffer) => {
      header = Buffer.concat([header, chunk]);
      const end = header.indexOf("\r\n\r\n");
      if (
        header.length > egressPolicy.headerBytes ||
        (end !== -1 &&
          header.subarray(0, end).toString().split("\r\n")[0] !==
            `CONNECT ${egressPolicy.target} HTTP/1.1`)
      ) {
        client.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
        client.removeListener("data", readHeader);
        return;
      }
      if (end === -1) return;
      client.removeListener("data", readHeader);
      client.pause();
      const upstream = connect();
      sockets.add(upstream);
      upstream.on("close", () => {
        sockets.delete(upstream);
        client.destroy();
      });
      upstream.on("error", () => {
        upstream.destroy();
        client.destroy();
      });
      client.on("close", () => upstream.destroy());
      upstream.setTimeout(egressPolicy.connectionDeadlineMs, () =>
        upstream.destroy(),
      );
      upstream.once("connect", () => {
        client.setTimeout(egressPolicy.idleDeadlineMs);
        upstream.setTimeout(egressPolicy.idleDeadlineMs);
        client.write(egressPolicy.connectedResponse);
        const remainder = header.subarray(end + 4);
        if (remainder.length) upstream.write(remainder);
        client.pipe(upstream).pipe(client);
        client.resume();
      });
    };
    client.on("data", readHeader);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "0.0.0.0", resolve);
  });
  const bound = server.address();
  if (!bound || typeof bound === "string")
    throw new Error("Missing egress listener");
  return {
    port: bound.port,
    stop: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
};
