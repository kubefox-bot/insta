import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { Resolver } from "node:dns/promises";
import { readClientSource } from "../../apps/be-insta/src/lib/http/source/read";
import { createTrustedSourceResolver } from "../../apps/fe-insta/src/lib/http/server/source/resolver";
import { signClientSource } from "../../apps/fe-insta/src/lib/http/server/source/sign";

const key = "a".repeat(64);
const now = 100_000;
const method = "POST";
const pathname = "/v1/privacy/preferences";
const digest = (source: string) =>
  createHash("sha256").update(source).digest("hex");
const native = (
  headers: Record<string, unknown>,
  at = now,
  path = pathname,
  verb = method,
) =>
  readClientSource({
    headers,
    peer: "192.0.2.9",
    key,
    now: at,
    pathname: path,
    method: verb,
  });

test("only exact known proxy peer supplies a single normalized source; spoofed and chained headers use peer", async () => {
  const resolver = createTrustedSourceResolver({
    hostname: "traefik",
    resolve: async () => ["192.0.2.1"],
    clock: () => now,
  });
  expect(
    await resolver.read({ peer: "192.0.2.1", forwardedFor: "198.51.100.1" }),
  ).toBe("198.51.100.1");
  expect(
    await resolver.read({ peer: "192.0.2.9", forwardedFor: "198.51.100.1" }),
  ).toBe("192.0.2.9");
  expect(
    await resolver.read({
      peer: "192.0.2.1",
      forwardedFor: "198.51.100.1, 198.51.100.2",
    }),
  ).toBe("192.0.2.1");
  expect(
    await resolver.read({
      peer: "::ffff:192.0.2.1",
      forwardedFor: "198.51.100.1",
    }),
  ).toBe("198.51.100.1");
});
test("proxy resolution is coalesced and bounded-cache refresh removes old peer; failure never keeps stale trust", async () => {
  const time = { now };
  const state = { calls: 0, addresses: ["192.0.2.1"], fail: false };
  const resolver = createTrustedSourceResolver({
    hostname: "traefik",
    clock: () => time.now,
    resolve: async () => {
      state.calls += 1;
      if (state.fail) throw new Error("DNS unavailable");
      return state.addresses;
    },
  });
  await Promise.all(
    [1, 2].map(() =>
      resolver.read({ peer: "192.0.2.1", forwardedFor: "198.51.100.1" }),
    ),
  );
  expect(state.calls).toBe(1);
  time.now += 30_001;
  state.addresses = ["192.0.2.2"];
  expect(
    await resolver.read({ peer: "192.0.2.1", forwardedFor: "198.51.100.1" }),
  ).toBe("192.0.2.1");
  expect(
    await resolver.read({ peer: "192.0.2.2", forwardedFor: "198.51.100.1" }),
  ).toBe("198.51.100.1");
  state.fail = true;
  time.now += 30_001;
  expect(
    await resolver.read({ peer: "192.0.2.2", forwardedFor: "198.51.100.1" }),
  ).toBe("192.0.2.2");
});
test("internal assertion authenticates source and exact request; direct native spoof falls back to real peer", () => {
  const headers = signClientSource({
    source: "198.51.100.1",
    method,
    pathname,
    key,
    now,
  });
  expect(native(headers)).toBe(digest("198.51.100.1"));
  expect(
    native({ ...headers, "x-insta-client-source": digest("198.51.100.2") }),
  ).toBe(digest("192.0.2.9"));
  expect(
    native({
      "x-forwarded-for": "198.51.100.1",
      "x-insta-client-source": "fake",
    }),
  ).toBe(digest("192.0.2.9"));
  expect(native(headers, now, "/v1/other")).toBe(digest("192.0.2.9"));
  expect(native(headers, now, pathname, "GET")).toBe(digest("192.0.2.9"));
  expect(
    native({ ...headers, "x-insta-source-signature": ["duplicate"] }),
  ).toBe(digest("192.0.2.9"));
});
test("signed source accepts exactly60s past and5s future, rejects stale/future and invalid timestamp", () => {
  const headers = signClientSource({
    source: "198.51.100.1",
    method,
    pathname,
    key,
    now,
  });
  expect(native(headers, now + 60_000)).toBe(digest("198.51.100.1"));
  expect(native(headers, now - 5_000)).toBe(digest("198.51.100.1"));
  expect(native(headers, now + 60_001)).toBe(digest("192.0.2.9"));
  expect(native(headers, now - 5_001)).toBe(digest("192.0.2.9"));
  expect(native({ ...headers, "x-insta-source-issued-at": "NaN" })).toBe(
    digest("192.0.2.9"),
  );
});

test("Bun DNS Resolver cancellation releases an actual pending query", async () => {
  const resolver = new Resolver({ timeout: 500, tries: 1 });
  resolver.setServers(["127.0.0.1"]);
  const lookup = resolver.resolve4("cancelled.invalid");
  resolver.cancel();
  await expect(lookup).rejects.toMatchObject({ code: "ECANCELLED" });
});
