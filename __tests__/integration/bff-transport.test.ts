import { expect, test } from "bun:test";
import { decryptSessionCookie } from "../../apps/fe-insta/src/lib/session/server/adapters/jose/cookie";
import { createMongoSessionStore } from "../../apps/fe-insta/src/lib/session/server/adapters/mongo/store";
import { createBffEnvironment } from "../fixtures/bff-session/environment";

test("real BFF login cookie grants session; Origin guards anonymous login and logout leaves cookie untouched", async () => {
  const f = await createBffEnvironment();
  const origin = "http://fe-insta:3000";
  try {
    const account = await f.native.account();
    const anonymous = await fetch(`${origin}/api/session`);
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get("set-cookie")).toBeNull();
    const denied = await fetch(`${origin}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(account),
    });
    expect(denied.status).toBe(403);
    const logged = await fetch(`${origin}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        origin: "https://fe-insta:3000",
      },
      body: JSON.stringify(account),
    });
    expect(logged.status).toBe(200);
    const cookie = logged.headers
      .getSetCookie()
      .find((value) => value.startsWith("insta_session="))
      ?.split(";")[0];
    expect(cookie).toBeDefined();
    const text = await logged.text();
    for (const secret of [
      "accessToken",
      "refreshToken",
      "revokeSecret",
      "bindingId",
    ])
      expect(text).not.toContain(secret);
    const bindingId = await decryptSessionCookie({
      cookie: cookie?.slice("insta_session=".length),
      key: f.config.sessionKeys.cookieKey,
      now: Date.now(),
    });
    if (!bindingId) throw new Error("Missing owned binding");
    const store = createMongoSessionStore(f.web.webDb);
    const initial = await store.read(bindingId);
    if (!initial) throw new Error("Missing persisted binding");
    const rotating = await f.dependencies.crypto.openCredentials(
      initial.credentials,
    );
    const accessToken = await f.native.auth.tokens.issueAccess({
      userId: initial.user.id,
      backendSessionId: initial.backendSessionId,
      now: Date.now() - 1000,
      accessExpiresAt: Date.now() - 1,
    });
    await f.web.webDb.collection("bff_sessions").updateOne(
      { bindingId },
      {
        $set: {
          credentials: await f.dependencies.crypto.sealCredentials({
            ...rotating,
            accessToken,
          }),
          accessExpiresAt: Date.now() - 1,
        },
      },
    );
    const session = await fetch(`${origin}/api/session`, {
      headers: { cookie: cookie ?? "" },
    });
    expect(session.status).toBe(200);
    expect(session.headers.get("set-cookie")).toBeNull();
    expect((await store.read(bindingId))?.revision).toBe(1);
    expect((await store.read(bindingId))?.revokeSecret).toBe(
      initial.revokeSecret,
    );
    const logout = await fetch(`${origin}/api/session/logout`, {
      method: "POST",
      headers: { origin: "https://fe-insta:3000", cookie: cookie ?? "" },
    });
    expect(logout.status).toBe(200);
    expect(logout.headers.get("set-cookie")).toBeNull();
    expect(await logout.json()).toMatchObject({
      ok: true,
      data: { revocation: "confirmed" },
    });
    expect(
      (
        await fetch(`${origin}/api/session`, {
          headers: { cookie: cookie ?? "" },
        })
      ).status,
    ).toBe(401);
  } finally {
    await f.dispose();
  }
});

test("cookie Origin guard rejects anonymous registration and form/multipart mutations before dispatch", async () => {
  for (const path of [
    "/api/auth/login",
    "/api/auth/registration/start",
    "/api/session/logout",
  ]) {
    for (const contentType of [
      "application/json",
      "application/x-www-form-urlencoded",
      "multipart/form-data; boundary=test",
    ]) {
      const response = await fetch(`http://fe-insta:3000${path}`, {
        method: "POST",
        headers: {
          origin: "https://foreign.example",
          "Content-Type": contentType,
        },
        body: "",
      });
      expect(response.status).toBe(403);
      expect(response.headers.get("set-cookie")).toBeNull();
    }
  }
});

test("shared cookie Origin guard preserves the privacy empty forbidden response", async () => {
  const response = await fetch("http://fe-insta:3000/api/privacy/consent", {
    method: "POST",
    headers: {
      origin: "https://foreign.example",
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  expect(response.status).toBe(403);
  expect(await response.text()).toBe("");
  expect(response.headers.get("set-cookie")).toBeNull();
});

for (const includeOrigin of [false, true]) {
  test(`framework HEAD reads the session without revocation (Origin=${includeOrigin})`, async () => {
    const f = await createBffEnvironment();
    const origin = "http://fe-insta:3000";
    try {
      const account = await f.native.account();
      const logged = await fetch(`${origin}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          origin: "https://fe-insta:3000",
        },
        body: JSON.stringify(account),
      });
      expect(logged.status).toBe(200);
      const cookie = logged.headers
        .getSetCookie()
        .find((value) => value.startsWith("insta_session="))
        ?.split(";")[0];
      if (!cookie) throw new Error("Missing owned session cookie");
      const actor = await logged.json();
      const target = { backendSessionId: actor.data.generation };
      const observe = async () => {
        const binding = await f.web.webDb
          .collection("bff_sessions")
          .findOne(target);
        const native = await f.native.db
          .collection("users_sessions")
          .findOne(target);
        return {
          blocked: binding?.blocked,
          pending: binding?.revocation !== undefined,
          confirmed: binding?.revocationConfirmed === true,
          nativeState: native?.state,
          logoutEvents: await f.native.db
            .collection("users_outbox")
            .countDocuments({ ...target, type: "logout_completed" }),
        };
      };
      const before = await observe();
      expect(before).toEqual({
        blocked: false,
        pending: false,
        confirmed: false,
        nativeState: "active",
        logoutEvents: 0,
      });
      const head = await fetch(`${origin}/api/session`, {
        method: "HEAD",
        headers: {
          cookie,
          ...(includeOrigin ? { origin: "https://fe-insta:3000" } : {}),
        },
      });
      expect({ status: head.status, state: await observe() }).toEqual({
        status: 200,
        state: before,
      });
      expect(await head.text()).toBe("");
      expect(head.headers.get("set-cookie")).toBeNull();
      for (const [path, method] of [
        ["/api/session", "POST"],
        ["/api/session", "PUT"],
        ["/api/session", "DELETE"],
        ["/api/session/logout", "GET"],
        ["/api/session/logout", "HEAD"],
        ["/api/session/logout", "PUT"],
        ["/api/session/logout", "DELETE"],
      ]) {
        const unsupported = await fetch(`${origin}${path}`, {
          method,
          headers: { cookie, origin: "https://fe-insta:3000" },
        });
        expect(unsupported.status).toBe(405);
        expect(unsupported.headers.get("set-cookie")).toBeNull();
        expect(await observe()).toEqual(before);
      }
      const current = await fetch(`${origin}/api/session`, {
        headers: { cookie },
      });
      expect(current.status).toBe(200);
      expect((await current.json()).data).toEqual(actor.data);
      const logout = await fetch(`${origin}/api/session/logout`, {
        method: "POST",
        headers: { cookie, origin: "https://fe-insta:3000" },
      });
      expect(logout.status).toBe(200);
      expect(logout.headers.get("set-cookie")).toBeNull();
      expect(await observe()).toEqual({
        blocked: true,
        pending: false,
        confirmed: true,
        nativeState: "revoked",
        logoutEvents: 1,
      });
      const denied = await fetch(`${origin}/api/session`, {
        method: "HEAD",
        headers: {
          cookie,
          ...(includeOrigin ? { origin: "https://fe-insta:3000" } : {}),
        },
      });
      expect(denied.status).toBe(401);
      expect(denied.headers.get("set-cookie")).toBeNull();
      expect(await denied.text()).toBe("");
    } finally {
      await f.dispose();
    }
  });
}
