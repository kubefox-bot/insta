import { connect, createServer, type Socket } from "node:net";
import { waitUntil } from "../barrier";
export const createMongoProxy = async (target: URL) => {
  const peers = new Set<Socket>();
  let blocked = false;
  let closed = 0;
  let barrier = Promise.withResolvers<void>();
  const server = createServer((downstream) => {
    const upstream = connect({
      host: target.hostname,
      port: Number(target.port || 27017),
    });
    peers.add(upstream);
    peers.add(downstream);
    downstream.on("data", (chunk) => {
      upstream.write(chunk);
      if (blocked) barrier.resolve();
    });
    upstream.on("data", (chunk) => {
      if (!blocked) downstream.write(chunk);
    });
    const release = () => {
      downstream.destroy();
      upstream.destroy();
    };
    downstream.on("error", release);
    upstream.on("error", release);
    downstream.once("close", () => {
      peers.delete(downstream);
      upstream.destroy();
      closed++;
    });
    upstream.once("close", () => {
      peers.delete(upstream);
      downstream.destroy();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Mongo proxy did not bind");
  const url = new URL(target);
  url.hostname = "127.0.0.1";
  url.port = String(address.port);
  url.searchParams.set("directConnection", "true");
  return {
    url: url.toString(),
    arm: () => {
      blocked = true;
      barrier = Promise.withResolvers<void>();
      return barrier.promise;
    },
    waitForClose: async (baseline: number) =>
      waitUntil({ check: async () => closed > baseline }),
    closed: () => closed,
    resume: () => {
      blocked = false;
    },
    dispose: async () => {
      await Promise.all(
        [...peers].map(
          (peer) =>
            new Promise<void>((resolve) => {
              peer.once("close", resolve);
              peer.destroy();
            }),
        ),
      );
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      if (peers.size) throw new Error("Mongo proxy resources retained");
    },
  };
};
