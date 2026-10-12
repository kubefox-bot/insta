import { expect, test } from "bun:test";
import { SessionErrorCode } from "@insta/contracts/errors";
import { createSessionSnapshotReader } from "../../src/domains/users/server/session/snapshot";

/** Создаёт изолированный запрос с наблюдаемыми session I/O и запретом cookie mutations. */
const fixture = ({
  cookie = "binding",
  response,
}: Readonly<{ cookie?: string | null; response: () => Promise<Response> }>) => {
  let calls = 0;
  const cookies: Parameters<typeof createSessionSnapshotReader>[0]["cookies"] =
    {
      get: (name: string) =>
        name === "insta_session" ? (cookie ?? undefined) : undefined,
      getAll: () => [],
      set: () => {
        throw new Error("SSR must not set cookies");
      },
      delete: () => {
        throw new Error("SSR must not delete cookies");
      },
      parse: () => {
        throw new Error("Unexpected cookie parse");
      },
      serialize: () => "",
    };
  const reader = createSessionSnapshotReader({
    request: new Request("https://insta.test/conversations"),
    origin: "https://insta.test",
    cookies,
    auth: {
      session: async (input) => {
        calls += 1;
        expect(input.cookies).toBe(cookies);
        expect(input.request.method).toBe("GET");
        return response();
      },
    },
  });
  return { reader, calls: () => calls };
};

test("reader is lazy and concurrent consumers share exactly one session promise", async () => {
  const session = Promise.withResolvers<Response>();
  const request = fixture({ response: () => session.promise });
  expect(request.calls()).toBe(0);
  const first = request.reader();
  const second = request.reader();
  expect(second).toBe(first);
  expect(request.calls()).toBe(1);
  session.resolve(
    Response.json({
      ok: true,
      data: { userId: "alice", username: "Alice", generation: "a" },
    }),
  );
  expect(await first).toEqual({
    actor: { userId: "alice", username: "Alice", generation: "a" },
    status: "authenticated",
  });
  expect(request.reader()).toBe(first);
  expect(request.calls()).toBe(1);
});

for (const outcome of ["missing-cookie", "expired", "unavailable"] as const) {
  test(`reader caches ${outcome} without promoting it to an authenticated actor`, async () => {
    const request = fixture({
      cookie: outcome === "missing-cookie" ? null : "binding",
      response: async () =>
        Response.json({
          ok: false,
          error: {
            code:
              outcome === "expired"
                ? SessionErrorCode.SessionRequired
                : SessionErrorCode.SessionUnavailable,
          },
        }),
    });
    const first = request.reader();
    expect(request.reader()).toBe(first);
    expect(await first).toEqual({
      actor: null,
      status: outcome === "unavailable" ? "unavailable" : "guest",
    });
    expect(request.reader()).toBe(first);
    expect(request.calls()).toBe(outcome === "missing-cookie" ? 0 : 1);
  });
}

test("overlapping requests cannot share actor, generation or session promise", async () => {
  const pending = Promise.withResolvers<Response>();
  const alice = fixture({ response: () => pending.promise });
  const bob = fixture({
    response: async () =>
      Response.json({
        ok: true,
        data: { userId: "bob", username: "Bob", generation: "b" },
      }),
  });
  const first = alice.reader();
  const second = bob.reader();
  expect(second).not.toBe(first);
  expect(await second).toEqual({
    actor: { userId: "bob", username: "Bob", generation: "b" },
    status: "authenticated",
  });
  pending.resolve(
    Response.json({
      ok: true,
      data: { userId: "alice", username: "Alice", generation: "a" },
    }),
  );
  expect(await first).toEqual({
    actor: { userId: "alice", username: "Alice", generation: "a" },
    status: "authenticated",
  });
  expect([alice.calls(), bob.calls()]).toEqual([1, 1]);
});
