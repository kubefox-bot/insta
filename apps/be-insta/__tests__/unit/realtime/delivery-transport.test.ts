import { expect, test } from "bun:test";
import {
  type DeliveryNotice,
  realtimeChannels,
} from "@insta/contracts/realtime";
import { exchangeDelivery } from "../../../src/domains/conversations/adapters/ws/delivery/exchange";
import { createDeliveryTarget } from "../../../src/domains/conversations/adapters/ws/delivery/send";
import { createSdkTransport } from "../../fixtures/realtime/transport";

const notice: DeliveryNotice = {
  version: 1,
  kind: "delivery-notice",
  subscriptionId: "7ee32a62-1281-4ac6-83e8-7f10d0112233",
  streamId: "unread:alice",
  epoch: "7ee32a62-1281-4ac6-83e8-7f10d0112244",
  code: "DELIVERY_BLOCKED" as DeliveryNotice["code"],
};

test("notice loss times out, wrong receipt retries, cancellation waits actual SDK callback settlement", async () => {
  await using transport = await createSdkTransport();
  const { socket, client } = transport;
  const target = createDeliveryTarget({ socket, ackTimeoutMs: 50 });
  const lifetime = new AbortController();
  expect(await target.notify({ notice, signal: lifetime.signal })).toBe(
    "retry",
  );
  client.once("delivery.notice", (_notice, ack) =>
    ack({
      ...notice,
      subscriptionId: "7ee32a62-1281-4ac6-83e8-7f10d0112255",
    }),
  );
  expect(await target.notify({ notice, signal: lifetime.signal })).toBe(
    "retry",
  );
  const received = Promise.withResolvers<(value: unknown) => void>();
  client.once("delivery.notice", (_notice, ack) => received.resolve(ack));
  let settled = false;
  const pending = target
    .notify({ notice, signal: lifetime.signal })
    .then((value) => {
      settled = true;
      return value;
    });
  const ack = await received.promise;
  lifetime.abort();
  await Promise.resolve();
  expect(settled).toBe(false);
  ack(notice);
  expect(await pending).toBe("closed");
  const next = new AbortController();
  client.once("delivery.notice", (_notice, acknowledge) => acknowledge(notice));
  expect(await target.notify({ notice, signal: next.signal })).toBe("received");
});

test("non-writable SDK transport does not accumulate delivery or notice packets, then resumes exactly once", async () => {
  await using transport = await createSdkTransport();
  const { socket, client } = transport;
  const state = { created: 0, received: 0 };
  socket.conn.on("packetCreate", (packet) => {
    if (packet.type === "message") state.created++;
  });
  for (const channel of [realtimeChannels.event, realtimeChannels.notice]) {
    client.on(channel, (payload, ack) => {
      state.received++;
      ack(payload);
    });
  }
  const signal = new AbortController().signal;
  socket.conn.transport.writable = false;
  try {
    for (const channel of [realtimeChannels.event, realtimeChannels.notice])
      for (let attempt = 0; attempt < 2; attempt++)
        expect(
          await exchangeDelivery({
            socket,
            ackTimeoutMs: 200,
            channel,
            payload: { owned: true },
            signal,
          }),
        ).toEqual({ kind: "timeout" });
    expect(state).toEqual({ created: 0, received: 0 });
  } finally {
    socket.conn.transport.writable = true;
  }
  for (const channel of [realtimeChannels.event, realtimeChannels.notice])
    expect(
      await exchangeDelivery({
        socket,
        ackTimeoutMs: 200,
        channel,
        payload: { owned: true },
        signal,
      }),
    ).toEqual({ kind: "received", payload: { owned: true } });
  expect(state).toEqual({ created: 2, received: 2 });
});
