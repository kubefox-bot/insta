import { expect, test } from "bun:test";
import { createConnection, createServer } from "node:net";
import { egressPolicy } from "../../fixtures/browser-egress/conts";
import { selectEgressAddress } from "../../fixtures/browser-egress/select";
import { startEgressServer } from "../../fixtures/browser-egress/server";

const exchange = (port: number, input: string) =>
  new Promise<string>((resolve, reject) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    let output = "";
    socket.setTimeout(2000, () => {
      socket.destroy();
      reject(new Error("Proxy test deadline"));
    });
    socket.on("error", reject);
    socket.on("data", (data) => {
      output += data.toString();
      if (output.includes("hello")) socket.end();
    });
    socket.on("end", () => resolve(output));
    socket.on("connect", () => socket.write(input));
  });
test("egress refuses arbitrary targets and bounded oversized headers without acquiring upstream", async () => {
  let called = 0;
  const proxy = await startEgressServer({
    port: 0,
    connect: () => {
      called++;
      throw new Error("Forbidden upstream acquired");
    },
  });
  try {
    for (const request of [
      "CONNECT foreign.test:443 HTTP/1.1\r\n\r\n",
      "GET http://localhost/ HTTP/1.1\r\n\r\n",
      `CONNECT localhost:443 HTTP/1.1\r\nX-Large: ${"x".repeat(egressPolicy.headerBytes)}\r\n\r\n`,
    ])
      expect(await exchange(proxy.port, request)).toContain("403 Forbidden");
    expect(called).toBe(0);
  } finally {
    await proxy.stop();
  }
});
test("fixed CONNECT preserves bytes through Bun net pipes; stop closes acquired connections", async () => {
  const upstream = createServer((socket) => socket.pipe(socket));
  await new Promise<void>((resolve) =>
    upstream.listen(0, "127.0.0.1", resolve),
  );
  const address = upstream.address();
  if (!address || typeof address === "string")
    throw new Error("Missing upstream");
  const proxy = await startEgressServer({
    port: 0,
    connect: () => createConnection({ host: "127.0.0.1", port: address.port }),
  });
  try {
    expect(
      await exchange(proxy.port, "CONNECT localhost:443 HTTP/1.1\r\n\r\nhello"),
    ).toContain("200 Connection Established\r\n\r\nhello");
    const idle = createConnection({ host: "127.0.0.1", port: proxy.port });
    await new Promise<void>((resolve) => idle.once("connect", resolve));
    const closed = new Promise<void>((resolve) =>
      idle.once("close", () => resolve()),
    );
    await proxy.stop();
    await closed;
  } finally {
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  }
});
test("static source allocation avoids live or retained addresses and fails exhausted/corrupt pools", () => {
  const subnet = "172.19.0.0/16";
  const first = selectEgressAddress({ subnet, occupied: new Set() });
  const second = selectEgressAddress({ subnet, occupied: new Set([first]) });
  expect(second).not.toBe(first);
  expect(() =>
    selectEgressAddress({ subnet: "172.19.0.1/16", occupied: new Set() }),
  ).toThrow("not canonical");
  expect(() =>
    selectEgressAddress({
      subnet: "172.19.0.0/30",
      occupied: new Set(["172.19.0.2"]),
    }),
  ).toThrow("refusing IP reuse");
});
