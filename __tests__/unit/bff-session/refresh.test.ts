import { expect, test } from "bun:test";
import { decideRefresh } from "../../../apps/fe-insta/src/lib/session/server/domain/refresh";
import type { Binding } from "../../../apps/fe-insta/src/lib/session/server/types";

const binding: Binding = {
  bindingId: "b",
  user: { id: "u", username: "user" },
  backendSessionId: "s",
  credentials: "cipher",
  revokeSecret: "cipher",
  revision: 0,
  accessExpiresAt: 100,
  expiresAt: 200,
  absoluteExpiresAt: 1000,
  blocked: false,
};
const attempt = {
  key: "key",
  credentials: "original",
  revision: 0,
  startedAt: 190,
  recoverUntil: 310,
  leaseOwner: "one",
  leaseGeneration: 1,
  leaseUntil: 205,
  state: "unknown" as const,
};
test("pre-expiry unknown attempt recovers after old expiry without extending cutoff", () => {
  expect(decideRefresh({ binding: { ...binding, attempt }, now: 206 })).toBe(
    "takeover",
  );
  expect(decideRefresh({ binding: { ...binding, attempt }, now: 309 })).toBe(
    "takeover",
  );
  expect(decideRefresh({ binding: { ...binding, attempt }, now: 310 })).toBe(
    "blocked",
  );
  expect(decideRefresh({ binding: { ...binding, attempt }, now: 311 })).toBe(
    "blocked",
  );
});
test("expiry without attempt and blocked bindings never rotate; lease wait is bounded externally", () => {
  expect(decideRefresh({ binding, now: 199 })).toBe("start");
  expect(decideRefresh({ binding, now: 200 })).toBe("blocked");
  expect(
    decideRefresh({ binding: { ...binding, blocked: true }, now: 50 }),
  ).toBe("blocked");
  expect(decideRefresh({ binding: { ...binding, attempt }, now: 204 })).toBe(
    "wait",
  );
  expect(decideRefresh({ binding: { ...binding, attempt }, now: 205 })).toBe(
    "takeover",
  );
});
