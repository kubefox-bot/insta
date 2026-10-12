import { createConnection } from "node:net";
import { waitUntil } from "../barrier";
import { egressPolicy } from "./conts";

const probePublishedPort = (port: number) =>
  new Promise<boolean>((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    let response = "";
    const finish = (ready: boolean) => {
      socket.destroy();
      resolve(ready);
    };
    socket.setTimeout(egressPolicy.connectionDeadlineMs, () => finish(false));
    socket.on("error", () => finish(false));
    socket.on("end", () => finish(false));
    socket.once("close", () => resolve(false));
    socket.once("connect", () =>
      socket.write(`CONNECT ${egressPolicy.target} HTTP/1.1\r\n\r\n`),
    );
    socket.on("data", (chunk) => {
      if (response.length + chunk.length > egressPolicy.headerBytes)
        return finish(false);
      response += chunk.toString();
      if (response.includes("\r\n\r\n"))
        finish(response === egressPolicy.connectedResponse);
    });
  });

export const waitForEgress = async ({
  port,
  readReady,
}: Readonly<{
  port: number;
  readReady: () => Promise<boolean>;
}>) =>
  waitUntil({
    check: async () => (await readReady()) && (await probePublishedPort(port)),
  });
