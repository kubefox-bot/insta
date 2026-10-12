import { expect } from "bun:test";
import { createServer, type Socket } from "node:net";
import type { Db } from "mongodb";
import { collections } from "../../../src/domains/conversations/adapters/mongo/conts";
export const verifyLostHttpResponse = async ({
  url,
  db,
  conversationId,
  accessToken,
}: Readonly<{
  url: string;
  db: Db;
  conversationId: string;
  accessToken: string;
}>) => {
  const key = crypto.randomUUID();
  const text = "synthetic response lost after committed HTTP200";
  const request = {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      "x-idempotency-key": key,
    },
    body: JSON.stringify({ text }),
  };
  const path = `/v1/conversations/${conversationId}/messages`;
  const committed = Promise.withResolvers<string>();
  const sockets = new Set<Socket>();
  const proxy = createServer((response) => {
    sockets.add(response);
    response.once("close", () => sockets.delete(response));
    const forward = async () => {
      const upstream = await fetch(`${url}${path}`, request);
      expect(upstream.status).toBe(200);
      const result = await upstream.json();
      expect(
        await db
          .collection(collections.messages)
          .countDocuments({ conversationId, text }),
      ).toBe(1);
      committed.resolve(result.data.id);
      response.destroy();
    };
    response.once("data", () => {
      forward().catch((error) => {
        committed.reject(error);
        response.destroy();
      });
    });
  });
  try {
    await new Promise<void>((resolve, reject) => {
      proxy.once("error", reject);
      proxy.listen(0, "127.0.0.1", resolve);
    });
    const address = proxy.address();
    if (address === null || typeof address === "string")
      throw new Error("Missing synthetic proxy port");
    await expect(
      fetch(`http://127.0.0.1:${address.port}${path}`, request),
    ).rejects.toBeInstanceOf(Error);
    const id = await committed.promise;
    const retry = await fetch(`${url}${path}`, request);
    expect(retry.status).toBe(200);
    expect((await retry.json()).data.id).toBe(id);
    expect(
      await db
        .collection(collections.messages)
        .countDocuments({ conversationId, text }),
    ).toBe(1);
  } finally {
    await new Promise<void>((resolve) => {
      for (const socket of sockets) socket.destroy();
      proxy.close(() => resolve());
    });
  }
};
