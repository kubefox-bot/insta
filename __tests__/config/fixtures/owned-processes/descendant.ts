process.on("SIGTERM", () => {});
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch: () => new Response("owned descendant"),
});
process.send?.({ port: server.port });
