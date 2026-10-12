import type { ConsentReference } from "@insta/fe-core/observability/analytics";
import {
  createMongoAuthPersistence,
  createSessionId,
} from "../../../apps/be-insta/src/domains/users/server/index";
import type { createUsersEnvironment } from "../users/environment";
export const activateCanonicalUser = async ({
  fixture,
  reference,
  readReference = () => reference,
}: Readonly<{
  fixture: Awaited<ReturnType<typeof createUsersEnvironment>>;
  reference?: ConsentReference;
  readReference?: () => ConsentReference | undefined;
}>) => {
  const now = Date.now();
  const tokenDigest = `${fixture.runId}-${crypto.randomUUID()}`;
  const pending = await fixture.persistence.createPending({
    email: fixture.email(crypto.randomUUID()),
    tokenDigest,
    now,
    emailVerifiedAt: now,
    registrationExpiresAt: now + 60000,
  });
  if (pending.isError()) throw new Error(pending.getError());
  const operationId = fixture.operation();
  const input = {
    userId: pending.get().id,
    tokenDigest,
    username: `U_${crypto.randomUUID().replaceAll("-", "").slice(-20)}`,
    passwordHash: "$argon2id$synthetic",
    now,
    operationId,
    session: {
      backendSessionId: createSessionId(),
      refreshDigest: "a".repeat(64),
      revokeDigest: "b".repeat(64),
      issuedAt: now,
      expiresAt: now + 7 * 86400000,
      absoluteExpiresAt: now + 30 * 86400000,
    },
    replay: {
      keyDigest: crypto.randomUUID(),
      fingerprint: crypto.randomUUID(),
      ciphertext: "synthetic",
    },
  };
  const persistence = createMongoAuthPersistence({
    ...fixture.database,
    clock: Date.now,
    analyticsReference: readReference,
  });
  const result = await persistence.activateAndIssueSession(input);
  if (result.isError()) throw new Error(result.getError());
  return { result, input, persistence };
};
