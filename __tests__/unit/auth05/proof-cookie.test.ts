import { expect, test } from "bun:test";
import {
  encryptRegistration,
  projectRegistration,
  readRegistration,
} from "../../../apps/fe-insta/src/domains/users/server/registration/cookie";

test("encrypted setup proof exposes only stage/deadline; foreign key, expiry and tampering cannot resume", async () => {
  const key = new Uint8Array(32).fill(1);
  const state = {
    stage: "setup" as const,
    proof: "native-private-proof",
    expiresAt: Date.now() + 60000,
    operationId: crypto.randomUUID(),
    key: crypto.randomUUID(),
  };
  const cookie = await encryptRegistration({ state, key });
  expect(cookie).not.toContain("native-private-proof");
  const input = { cookie, key, now: Date.now() };
  expect(await projectRegistration(input)).toEqual({
    stage: "setup",
    expiresAt: state.expiresAt,
  });
  expect((await readRegistration(input))?.stage).toBe("setup");
  expect(
    await readRegistration({ ...input, key: new Uint8Array(32).fill(2) }),
  ).toBeUndefined();
  expect(
    await readRegistration({ ...input, now: state.expiresAt }),
  ).toBeUndefined();
  expect(
    await readRegistration({ ...input, cookie: `${cookie}tampered` }),
  ).toBeUndefined();
});
