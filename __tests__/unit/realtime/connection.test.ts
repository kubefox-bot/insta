import { expect, test } from "bun:test";
import { createServer } from "node:http";
import { Server } from "socket.io";

test("client explicitly reconnects after middleware rejection with a new ticket after more than five failures and releases resources", async () => {
  const path = "../../../apps/fe-insta/src/lib/realtime/connection.ts";
  expect(await Bun.file(new URL(path, import.meta.url)).exists()).toBe(true);
  const { createConnection } = await import(path);
  const server = createServer();
  const io = new Server(server, { path: "/event" });
  const seen: string[] = [];
  io.use((socket, next) => {
    seen.push(socket.handshake.auth.ticket);
    next(seen.length <= 7 ? new Error("temporary") : undefined);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing listener");
  const ticketRequests: string[] = [];
  const connected = Promise.withResolvers<void>();
  const connection = createConnection({
    url: `http://127.0.0.1:${address.port}`,
    retryDelay: () => 1,
    obtainTicket: async () => {
      const ticket = crypto.randomUUID();
      ticketRequests.push(ticket);
      return { kind: "issued", ticket };
    },
    handlers: {
      "messages.created": () => "stale" as const,
      "conversations.unread.changed": () => "stale" as const,
      "messages.receipts.updated": () => "stale" as const,
    },
    observe: (value: { kind: string }) => {
      if (value.kind === "connected") connected.resolve();
    },
    onUnauthorized: () => {
      throw new Error("Unexpected auth invalidation");
    },
    onGenerationLost: () => {},
  });
  try {
    connection.connect();
    await connected.promise;
    expect(seen).toHaveLength(8);
    expect(seen[0]).not.toBe(seen[1]);
    expect(ticketRequests).toEqual(seen);
  } finally {
    await connection.dispose();
    await new Promise<void>((resolve) => io.close(() => resolve()));
  }
});

test("client delegates 401 to auth owner and stops automatic attempts", async () => {
  const path = "../../../apps/fe-insta/src/lib/realtime/connection.ts";
  expect(await Bun.file(new URL(path, import.meta.url)).exists()).toBe(true);
  const { createConnection } = await import(path);
  let unauthorized = 0;
  const authorizationDelegated = Promise.withResolvers<void>();
  const auth = createConnection({
    url: "http://127.0.0.1:1",
    obtainTicket: async () => ({ kind: "unauthorized" }),
    handlers: {
      "messages.created": () => "stale" as const,
      "conversations.unread.changed": () => "stale" as const,
      "messages.receipts.updated": () => "stale" as const,
    },
    observe: () => {},
    onUnauthorized: () => {
      unauthorized++;
      authorizationDelegated.resolve();
    },
    onGenerationLost: () => {},
  });
  auth.connect();
  await authorizationDelegated.promise;
  await auth.dispose();
  expect(unauthorized).toBe(1);
});

test("dispose drains cancelled ticket cleanup from a superseded connection generation", async () => {
  const { createConnection } = await import(
    "../../../apps/fe-insta/src/lib/realtime/connection"
  );
  const firstStarted = Promise.withResolvers<void>();
  const secondStarted = Promise.withResolvers<void>();
  const secondSettled = Promise.withResolvers<void>();
  const firstCleanup = Promise.withResolvers<void>();
  let issued = 0;
  let disposed = false;
  const connection = createConnection({
    url: "http://127.0.0.1:1",
    handlers: {
      "messages.created": () => "stale" as const,
      "conversations.unread.changed": () => "stale" as const,
      "messages.receipts.updated": () => "stale" as const,
    },
    onUnauthorized: () => {},
    onGenerationLost: () => {},
    observe: () => {},
    obtainTicket: async (signal) => {
      issued++;
      const first = issued === 1;
      if (first) firstStarted.resolve();
      else secondStarted.resolve();
      await new Promise<void>((resolve) =>
        signal.addEventListener("abort", () => resolve(), { once: true }),
      );
      if (first) await firstCleanup.promise;
      else secondSettled.resolve();
      return { kind: "unavailable" };
    },
  });
  connection.connect();
  await firstStarted.promise;
  connection.connect();
  await secondStarted.promise;
  const disposal = connection.dispose().then(() => {
    disposed = true;
  });
  try {
    await secondSettled.promise;
    await new Promise<void>((resolve) =>
      queueMicrotask(() => queueMicrotask(() => queueMicrotask(resolve))),
    );
    expect(disposed).toBe(false);
  } finally {
    firstCleanup.resolve();
    await disposal;
  }
  expect(disposed).toBe(true);
});

test("offline makes no requests and repeated foreground events cannot create another retry timer", async () => {
  const { createConnection } = await import(
    "../../../apps/fe-insta/src/lib/realtime/connection"
  );
  let online = false;
  let tickets = 0;
  const retry = Promise.withResolvers<void>();
  const connection = createConnection({
    url: "http://127.0.0.1:1",
    online: () => online,
    retryDelay: () => 100000,
    obtainTicket: async () => {
      tickets++;
      return { kind: "unavailable" };
    },
    handlers: {
      "messages.created": () => "stale",
      "messages.receipts.updated": () => "stale",
      "conversations.unread.changed": () => "stale",
    },
    observe: (value) => {
      if (value.kind === "retry" && tickets) retry.resolve();
    },
    onUnauthorized: () => {},
    onGenerationLost: () => {},
  });
  connection.connect();
  connection.resume();
  expect(tickets).toBe(0);
  online = true;
  connection.resume();
  await retry.promise;
  connection.resume();
  connection.resume();
  expect(tickets).toBe(1);
  await connection.dispose();
});
test("equal jitter uses injected randomness and retains a bounded delay after arbitrarily many failures", async () => {
  const { retryDelay } = await import(
    "../../../apps/fe-insta/src/lib/realtime/retry-delay"
  );
  expect(retryDelay({ attempt: 1, random: () => 0 })).toBe(500);
  expect(retryDelay({ attempt: 1, random: () => 0.5 })).toBe(750);
  expect(retryDelay({ attempt: 40, random: () => 0 })).toBe(15000);
  expect(retryDelay({ attempt: 40, random: () => 0.5 })).toBe(22500);
});
