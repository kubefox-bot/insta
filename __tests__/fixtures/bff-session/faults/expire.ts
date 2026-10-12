import type { SessionDependencies } from "../../../../apps/fe-insta/src/lib/session/server/index";
import type { FaultFixture } from "./types";
export const expireOwnedAccess = async ({
  fixture,
  sessions,
  binding,
}: {
  readonly fixture: FaultFixture;
  readonly sessions: SessionDependencies;
  readonly binding: import("../../../../apps/fe-insta/src/lib/session/server/types").Binding;
}) => {
  const rotating = await sessions.crypto.openCredentials(binding.credentials);
  const actor = await fixture.native.auth.tokens.verifyAccess({
    accessToken: rotating.accessToken,
    now: Date.now(),
  });
  if (actor.isError())
    throw new Error("Expected originally valid owned access token");
  if (
    actor.get().userId !== binding.user.id ||
    actor.get().backendSessionId !== binding.backendSessionId
  )
    throw new Error("Owned token actor mismatch");
  const accessToken = await fixture.native.auth.tokens.issueAccess({
    userId: actor.get().userId,
    backendSessionId: actor.get().backendSessionId,
    now: Date.now() - 1000,
    accessExpiresAt: Date.now() - 1,
  });
  await fixture.web.webDb.collection("bff_sessions").updateOne(
    { bindingId: binding.bindingId, "user.id": binding.user.id },
    {
      $set: {
        accessExpiresAt: Date.now() - 1,
        credentials: await sessions.crypto.sealCredentials({
          ...rotating,
          accessToken,
        }),
      },
    },
  );
};
