import { createServer } from "node:http";
import { Server } from "socket.io";

const server = createServer((_request, response) => {
  response.writeHead(200, { "Content-Type": "text/plain" });
  response.end("frontend fixture");
});
const io = new Server(server, {
  path: "/event",
  transports: ["polling", "websocket"],
});
io.on("connection", (socket) => {
  socket.on("probe", (ack) => ack("real-socket-io"));
});
server.listen(3001, "0.0.0.0");
const web = Bun.serve({
  port: 3000,
  hostname: "0.0.0.0",
  fetch: () => new Response("frontend fixture"),
});
process.on("SIGTERM", () => {
  io.close();
  web.stop(true).catch(() => {
    process.exitCode = 1;
  });
});
