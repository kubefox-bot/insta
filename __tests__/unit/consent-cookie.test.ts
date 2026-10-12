import { expect, test } from "bun:test";
import {
  decryptConsentCookie,
  encryptConsentCookie,
} from "../../apps/fe-insta/src/domains/privacy/server/cookie";
import { loadPreference } from "../../apps/fe-insta/src/domains/privacy/server/load";
import { savePreference } from "../../apps/fe-insta/src/domains/privacy/server/save";

const key = crypto.getRandomValues(new Uint8Array(32));
test("JWE proof stays out of public state, GET never extends cookie; forged inbound header is discarded", async () => {
  const proof = "S".repeat(43);
  const cookie = await encryptConsentCookie({
    contextProof: proof,
    expiresAt: Date.now() + 100000,
    key,
  });
  expect(cookie).not.toContain(proof);
  expect(await decryptConsentCookie({ cookie, key })).toBe(proof);
  expect(
    await decryptConsentCookie({ cookie: `${cookie.slice(0, -4)}AAAA`, key }),
  ).toBeUndefined();
  expect(
    await decryptConsentCookie({
      cookie,
      key: crypto.getRandomValues(new Uint8Array(32)),
    }),
  ).toBeUndefined();
  const seen: string[] = [];
  const cookies = {
    get: () => cookie,
    set: () => {
      seen.push("rewrite");
    },
  };
  const preferences = {
    read: async (contextProof?: string) => {
      seen.push(contextProof ?? "absent");
      return {
        choice: "all" as const,
        policyVersion: 1,
        revision: 1,
      };
    },
    save: async () => {
      throw new Error("unused");
    },
  };
  const state = await loadPreference({ cookies, key, preferences });
  expect(JSON.stringify(state)).not.toContain(proof);
  expect(seen).toEqual([proof]);
  const forged = await savePreference({
    request: new Request("https://localhost/api/privacy/consent", {
      method: "POST",
      headers: {
        origin: "https://localhost",
        "Content-Type": "application/json",
        "X-Consent-Context": "FORGED",
      },
      body: JSON.stringify({ choice: "all", policyVersion: 1 }),
    }),
    origin: "https://localhost",
    cookies: { get: () => undefined, set: () => {} },
    key,
    preferences: {
      ...preferences,
      save: async (_input, contextProof) => {
        expect(contextProof).toBeUndefined();
        throw new Error("offline");
      },
    },
  });
  expect(forged.status).toBe(503);
});
test("BFF requires Origin and strict small input; confirms state only after save and secure cookie", async () => {
  const calls: string[] = [];
  const proof = "B".repeat(43);
  const expiresAt = Date.now() + 100000;
  const options = {
    origin: "https://localhost",
    key,
    cookies: {
      get: () => undefined,
      set: (
        _name: string,
        _value: string,
        options: { httpOnly: boolean; secure: boolean; sameSite: string },
      ) => {
        expect(options).toMatchObject({
          httpOnly: true,
          secure: true,
          sameSite: "lax",
        });
        calls.push("cookie");
      },
    },
    preferences: {
      read: async () => ({
        choice: "necessary" as const,
        policyVersion: 1,
        revision: 0,
      }),
      save: async () => {
        calls.push("persist");
        return {
          state: {
            choice: "all" as const,
            policyVersion: 1,
            revision: 1,
          },
          contextProof: proof,
          expiresAt,
        };
      },
    },
  };
  const request = (body: string, origin?: string) =>
    new Request("https://localhost/api/privacy/consent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(origin ? { origin } : {}),
      },
      body,
    });
  expect(
    (
      await savePreference({
        ...options,
        request: request('{"choice":"all","policyVersion":1}'),
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await savePreference({
        ...options,
        request: request("{broken", options.origin),
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await savePreference({
        ...options,
        request: request(
          JSON.stringify({ choice: "all", policyVersion: 1, consent: true }),
          options.origin,
        ),
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await savePreference({
        ...options,
        request: request(" ".repeat(4097), options.origin),
      })
    ).status,
  ).toBe(413);
  const response = await savePreference({
    ...options,
    request: request(
      JSON.stringify({ choice: "all", policyVersion: 1 }),
      options.origin,
    ),
  });
  expect(response.status).toBe(200);
  expect(calls).toEqual(["persist", "cookie"]);
  expect(await response.text()).not.toContain(proof);
});
test("BFF public GET/POST projection has exactly three keys despite the Native choice-needed flag", async () => {
  const native = {
    choice: "all" as const,
    policyVersion: 1,
    revision: 1,
    needsChoice: false,
  };
  const preferences = {
    read: async () => native,
    save: async () => ({
      state: native,
      contextProof: "C".repeat(43),
      expiresAt: Date.now() + 100000,
    }),
  };
  const cookies = { get: () => undefined, set: () => {} };
  const state = await loadPreference({ cookies, key, preferences });
  expect(Object.keys(state).sort()).toEqual([
    "choice",
    "policyVersion",
    "revision",
  ]);
  const response = await savePreference({
    request: new Request("https://localhost/api/privacy/consent", {
      method: "POST",
      headers: {
        origin: "https://localhost",
        "content-type": "application/json",
      },
      body: JSON.stringify({ choice: "all", policyVersion: 1 }),
    }),
    origin: "https://localhost",
    cookies,
    key,
    preferences,
  });
  expect(Object.keys(await response.json()).sort()).toEqual([
    "choice",
    "policyVersion",
    "revision",
  ]);
});
