import { createMongoSessionStore } from "../../../../apps/fe-insta/src/lib/session/server/adapters/mongo/store";
import {
  decryptSessionCookie,
  sessionCookieName,
} from "../../../../apps/fe-insta/src/lib/session/server/cookies";
import { createFaultBackend } from "./backend";
import { controlBindingFault } from "./control";
import { readOnlyCookies } from "./cookies";
import { faultSessionResponse } from "./transport";
import type { FaultFixture, FaultState } from "./types";

export const createSessionFaultRouter = async ({
  fixture,
  emails,
}: {
  readonly fixture: FaultFixture;
  readonly emails: readonly string[];
}) => {
  const users = await fixture.native.db
    .collection("users")
    .find({ emailKey: { $in: emails } })
    .toArray();
  const ownedUsers = new Set(users.map((user) => user._id.toHexString()));
  const store = createMongoSessionStore(fixture.web.webDb);
  const state: FaultState = {
    nativeDown: false,
    failIntent: false,
    refreshMode: "normal",
    released: false,
    entered: false,
    refreshKeys: [],
  };
  const sessions = {
    ...fixture.dependencies,
    clock: () => state.clockOverride ?? Date.now(),
    wait: Bun.sleep,
    backend: createFaultBackend({ fixture, state }),
    store: {
      ...store,
      beginRevocation: (...args: Parameters<typeof store.beginRevocation>) => {
        if (state.failIntent)
          throw new Error("Synthetic owned intent persistence failure");
        return store.beginRevocation(...args);
      },
    },
  };
  const request = async (input: Request) => {
    const cookies = readOnlyCookies(input);
    const bindingId = await decryptSessionCookie({
      cookie: cookies.get(sessionCookieName),
      key: fixture.config.sessionKeys.cookieKey,
      now: sessions.clock(),
    });
    const binding = bindingId ? await store.read(bindingId) : null;
    if (!binding || !ownedUsers.has(binding.user.id))
      return new Response(null, { status: 403 });
    const path = new URL(input.url).pathname;
    if (path === "/control")
      return controlBindingFault({
        request: input,
        fixture,
        sessions,
        state,
        binding,
      });
    return faultSessionResponse({
      input,
      path,
      cookies,
      sessions,
      cookieKey: fixture.config.sessionKeys.cookieKey,
    });
  };
  return {
    request,
    release: () => {
      state.released = true;
    },
  };
};
