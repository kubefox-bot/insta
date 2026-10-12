import { expect, test } from "bun:test";
import { historyQuerySchema } from "../../../src/domains/conversations/adapters/http/history/dto";
import { historyRange } from "../../../src/domains/conversations/adapters/http/history/map";
import {
  decodeCursor,
  encodeCursor,
} from "../../../src/domains/conversations/domain/history/cursor";
import { historyPage } from "../../../src/domains/conversations/domain/history/page";

test("raw sequence is checked before Number can round it", () => {
  for (const after of [
    "9007199254740991.1",
    "1.0000000000000001",
    "9007199254740992",
    "9".repeat(10000),
    "1e2",
    "0x10",
    "-1",
  ]) {
    expect(historyQuerySchema.safeParse({ after }).success).toBe(false);
  }
  expect(historyQuerySchema.parse({ after: "9007199254740991" }).after).toBe(
    Number.MAX_SAFE_INTEGER,
  );
  expect(historyQuerySchema.parse({}).after).toBeUndefined();
});
test("initial snapshot uses exactly50 even when direct caller supplies a page limit", () => {
  const rows = Array.from({ length: 101 }, (_, offset) => ({
    id: String(offset),
    conversationId,
    senderId: "actor",
    text: "synthetic",
    sequence: 100 - offset,
    createdAt: 1,
  }));
  for (const limit of [10, 100]) {
    const page = historyPage({
      rows,
      range: { direction: "recent" },
      limit,
      conversationId,
      watermark: 100,
    });
    expect(page.items.map((item) => item.sequence)).toEqual(
      Array.from({ length: 50 }, (_, offset) => 51 + offset),
    );
    expect(page.baselineCursor).toBe(50);
  }
});
test("incomplete initial rows cannot declare a full snapshot interval", () => {
  const rows = Array.from({ length: 11 }, (_, offset) => ({
    id: String(offset),
    conversationId,
    senderId: "actor",
    text: "synthetic",
    sequence: 100 - offset,
    createdAt: 1,
  }));
  expect(() =>
    historyPage({
      rows,
      range: { direction: "recent" },
      limit: 10,
      conversationId,
      watermark: 100,
    }),
  ).toThrow("Incomplete initial history snapshot");
});
test("query rejects incompatible recent limits and retains variable subsequent pages", () => {
  for (const limit of [10, 100])
    expect(historyQuerySchema.safeParse({ limit: String(limit) }).success).toBe(
      false,
    );
  expect(historyQuerySchema.parse({ limit: "50" }).limit).toBe(50);
  expect(historyQuerySchema.parse({ after: "0", limit: "10" }).limit).toBe(10);
  const cursor = encodeCursor({
    direction: "before",
    conversationId,
    sequence: 51,
    watermark: 100,
  });
  expect(historyQuerySchema.parse({ cursor, limit: "100" }).limit).toBe(100);
});

const conversationId = "000000000000000000000001";
test("older page retains the snapshot recovery baseline", () => {
  const page = historyPage({
    conversationId,
    range: { direction: "before", sequence: 25, watermark: 100 },
    limit: 10,
    watermark: 100,
    rows: [],
  });
  expect(page.baselineCursor).toBe(50);
});
test("opaque cursors bind every field and conversation without rounding positions", () => {
  const cursor = encodeCursor({
    direction: "after",
    conversationId,
    sequence: 3,
    watermark: 5,
  });
  expect(decodeCursor({ value: cursor, conversationId })).toEqual({
    direction: "after",
    conversationId,
    sequence: 3,
    watermark: 5,
  });
  expect(
    decodeCursor({ value: cursor, conversationId: "000000000000000000000002" }),
  ).toBeNull();
  for (const value of [
    "not-json",
    Buffer.from(
      JSON.stringify({
        direction: "after",
        conversationId,
        sequence: 6,
        watermark: 5,
      }),
    ).toString("base64url"),
    Buffer.from(
      JSON.stringify({
        direction: "after",
        conversationId,
        sequence: Number.MAX_SAFE_INTEGER + 1,
        watermark: Number.MAX_SAFE_INTEGER + 1,
      }),
    ).toString("base64url"),
  ])
    expect(decodeCursor({ value, conversationId })).toBeNull();
  expect(
    historyQuerySchema.safeParse({ after: "9007199254740992" }).success,
  ).toBe(false);
  expect(historyQuerySchema.safeParse({ cursor, after: "0" }).success).toBe(
    false,
  );
  expect(
    historyRange({
      input: historyQuerySchema.parse({ after: "0" }),
      conversationId,
    }),
  ).toEqual({ direction: "after", sequence: 0 });
});
