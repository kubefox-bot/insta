import type { Page, WebSocketRoute } from "@playwright/test";
import { z } from "zod";

const snapshotSchema = z.object({
  conversation: z.object({
    _id: z.string(),
    lastSequence: z.number(),
    lastActivityAt: z.string(),
  }),
  messages: z.array(
    z.object({
      _id: z.string(),
      text: z.string(),
      sequence: z.number(),
      senderId: z.string(),
    }),
  ),
  receipts: z.array(
    z.object({
      messageId: z.string(),
      recipientId: z.string(),
      sequence: z.number(),
      deliveredAt: z.number().nullable(),
      readAt: z.number().nullable(),
    }),
  ),
  events: z.array(z.object({ eventId: z.string(), state: z.string() })),
});
export const readMarks = async ({
  fixtureUrl,
  conversationUrl,
}: Readonly<{ fixtureUrl: string; conversationUrl: string }>) => {
  const conversationId = new URL(conversationUrl).pathname.split("/").at(-1);
  const response = await fetch(
    `${fixtureUrl}/marks?conversationId=${conversationId}`,
  );
  if (!response.ok) throw new Error(`Owned marks snapshot: ${response.status}`);
  return snapshotSchema.parse(await response.json());
};
export const browserState = (page: Page) =>
  page.evaluate(() => ({
    visibility: document.visibilityState,
    focused: document.hasFocus(),
  }));
export const recordAcknowledgments = (page: Page) => {
  const requests: { status: string; messageIds: string[] }[] = [];
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname.endsWith("/receipts") &&
      request.method() === "POST"
    ) {
      const batch = z
        .object({ status: z.string(), messageIds: z.array(z.string()) })
        .parse(request.postDataJSON());
      requests.push(batch);
    }
  });
  return requests;
};
export const observeReceiptEvents = async (
  page: Page,
  dropped: { current: boolean },
) => {
  const frames: string[] = [];
  const subscriptions: string[] = [];
  // The transport is WebSocket-only; collect only subscription commands below.
  const connections: { browser: WebSocketRoute; server: WebSocketRoute }[] = [];
  await page.routeWebSocket(
    (url) => url.pathname === "/event/",
    (route) => {
      const server = route.connectToServer();
      connections.push({ browser: route, server });
      route.onMessage((frame) => {
        if (
          typeof frame === "string" &&
          frame.includes('"conversations.subscribe"')
        )
          subscriptions.push(frame);
        server.send(frame);
      });
      server.onMessage((frame) => {
        if (
          typeof frame === "string" &&
          frame.includes('"messages.receipts.updated"')
        ) {
          frames.push(frame);
          if (dropped.current) return;
        }
        route.send(frame);
      });
    },
  );
  return {
    frames,
    subscriptions,
    generations: () => connections.length,
    disconnect: async () => {
      const connection = connections.at(-1);
      if (!connection) throw new Error("No actual WebSocket to disconnect");
      await connection.browser.close({
        code: 1012,
        reason: "Owned recovery test",
      });
      await connection.server.close({
        code: 1012,
        reason: "Owned recovery test",
      });
    },
  };
};
