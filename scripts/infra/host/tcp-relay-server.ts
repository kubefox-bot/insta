import { createConnection, createServer } from "node:net";

const targetHost = process.argv[2];
const targetPort = Number(process.argv[3]);
const listenPort = Number(process.argv[4]);
if (
  !targetHost ||
  !Number.isInteger(targetPort) ||
  targetPort < 1 ||
  !Number.isInteger(listenPort) ||
  listenPort < 1
)
  throw new Error("TCP relay target is invalid");

const server = createServer((client) => {
  const upstream = createConnection({ host: targetHost, port: targetPort });
  client.pipe(upstream);
  upstream.pipe(client);
  client.on("error", () => upstream.destroy());
  upstream.on("error", () => client.destroy());
  client.on("close", () => upstream.destroy());
  upstream.on("close", () => client.destroy());
});
server.listen(listenPort, "0.0.0.0");
