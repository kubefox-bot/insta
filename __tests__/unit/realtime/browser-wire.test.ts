import { expect, test } from "bun:test";
import {
  readAcknowledgementId,
  readDeliveryReply,
  readMessageDelivery,
} from "../../fixtures/delivery/browser/wire";

test("Socket.IO ACK parser identifies the entire callback id and ignores unrelated frames", () => {
  expect(readAcknowledgementId('43123[{"kind":"applied"}]')).toBe("123");
  for (const frame of ["2", "5", '42["event",{}]', new Uint8Array([1])]) {
    expect(readAcknowledgementId(frame)).toBeUndefined();
    expect(readMessageDelivery(frame)).toBeUndefined();
  }
});
test("malformed business event is rejected rather than counted as injected fault", () => {
  expect(() => readMessageDelivery('421["event",{}]')).toThrow();
});
test("delivery reply observation rejects command ACKs and preserves a transient cursor", () => {
  const position = {
    streamId: "unread:owned",
    epoch: crypto.randomUUID(),
    cursor: 7,
    subscriptionId: crypto.randomUUID(),
  };
  expect(
    readDeliveryReply(
      `4312${JSON.stringify([{ kind: "retry-later", position, retryAfterMs: 3000 }])}`,
    ),
  ).toEqual({ kind: "retry-later", position, retryAfterMs: 3000 });
  expect(readDeliveryReply('4312[{"ok":true}]')).toBeUndefined();
});
