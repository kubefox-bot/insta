import { createHmac } from "node:crypto";
import { createDragonflyAuthLimits } from "../../../apps/be-insta/src/domains/users/adapters/dragonfly/limits";
import { createSessionId } from "../../../apps/be-insta/src/domains/users/adapters/mongo/mapper";
import { createMongoSessions } from "../../../apps/be-insta/src/domains/users/adapters/mongo/sessions";
import { createBunHasher } from "../../../apps/be-insta/src/domains/users/adapters/passwords/bun-hasher";
import { createJoseTokens } from "../../../apps/be-insta/src/domains/users/auth/adapters/jose/tokens";
import {
  connectDragonfly,
  readGeneration,
} from "../../../apps/be-insta/src/lib/dragonfly/index";
import { readTestApiConfig } from "../environment";
import { setupFailure } from "../lifecycle/setup-failure";
import { createUsersEnvironment } from "./environment";
export const createAuthEnvironment = async ({
  collectionNamespace,
}: Readonly<{ collectionNamespace?: string }> = {}) => {
  const config = readTestApiConfig();
  const fixture = await createUsersEnvironment(
    collectionNamespace === undefined ? {} : { collectionNamespace },
  );
  const broker = await connectDragonfly({ config: config.dragonfly }).catch(
    async (error: unknown) => {
      try {
        await fixture.dispose();
      } catch (cleanupError) {
        throw setupFailure({
          error,
          cleanupError,
          message: "Auth fixture setup and cleanup failed",
        });
      }
      throw error;
    },
  );
  try {
    const passwords = createBunHasher();
    const key = createHmac("sha256", Buffer.from(config.authLimitsKey, "hex"))
      .update(fixture.runId)
      .digest("hex");
    const limits = createDragonflyAuthLimits({ client: broker, key });
    const keys = new Set<string>();
    const generation = await readGeneration(broker);
    const trackedLimits = {
      ...limits,
      consume: async (input: Parameters<typeof limits.consume>[0]) => {
        const digest = createHmac("sha256", Buffer.from(key, "hex"))
          .update(input.subject)
          .digest("hex");
        keys.add(`auth:${generation}:users:limit:${input.limit}:${digest}`);
        return limits.consume(input);
      },
    };
    let now = Date.now();
    const clock = () => now;
    const auth = {
      sessions: createMongoSessions({ ...fixture.database, clock }),
      tokens: createJoseTokens({
        signingKey: config.authSigningKey,
        replayKey: config.authReplayKey,
      }),
      passwords,
      clock,
      sessionId: createSessionId,
      operationId: fixture.operation,
    };
    return {
      ...fixture,
      auth,
      limits: trackedLimits,
      sessionId: createSessionId(),
      clock,
      advance: (milliseconds: number) => {
        now += milliseconds;
      },
      users: {
        auth,
        limits: trackedLimits,
        passwords,
        persistence: fixture.persistence,
      },
      account: async (password = "synthetic-password-123") => {
        const email = fixture.email(crypto.randomUUID());
        const proof = crypto.randomUUID();
        const pending = await fixture
          .persistenceWithClock(clock)
          .createPending({
            email,
            now,
            emailVerifiedAt: now,
            registrationExpiresAt: now + 86400000,
            tokenDigest: proof,
          });
        if (pending.isError()) throw new Error(pending.getError());
        const activated = await fixture
          .persistenceWithClock(clock)
          .activateAndIssueSession({
            userId: pending.get().id,
            tokenDigest: proof,
            username: `U${crypto.randomUUID().replaceAll("-", "").slice(0, 25)}`,
            passwordHash: await passwords.hash({ password }),
            now,
            operationId: fixture.operation(),
            session: {
              backendSessionId: createSessionId(),
              refreshDigest: crypto.randomUUID(),
              revokeDigest: crypto.randomUUID(),
              issuedAt: now,
              expiresAt: now + 604800000,
              absoluteExpiresAt: now + 2592000000,
            },
          });
        if (activated.isError()) throw new Error(activated.getError());
        return { email, password };
      },
      dispose: async () => {
        try {
          for (const key of keys) {
            await broker.del(key);
            if ((await broker.get(key)) !== null)
              throw new Error("Auth quota cleanup incomplete");
          }
        } finally {
          broker.close();
          await fixture.dispose();
        }
      },
    };
  } catch (error) {
    broker.close();
    try {
      await fixture.dispose();
    } catch (cleanupError) {
      throw setupFailure({
        error,
        cleanupError,
        message: "Auth fixture setup and cleanup failed",
      });
    }
    throw error;
  }
};
