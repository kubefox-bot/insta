import { Result } from "@bloodyowl/boxed";
import { z } from "zod";
import { connectDatabase } from "../../../apps/fe-insta/src/lib/database/server/index";
import { createSessionCrypto } from "../../../apps/fe-insta/src/lib/session/server/adapters/jose/crypto";
import { createMongoSessionStore } from "../../../apps/fe-insta/src/lib/session/server/adapters/mongo/store";
import type { BackendAuth } from "../../../apps/fe-insta/src/lib/session/server/ports/backend-auth";
import { refreshBinding } from "../../../apps/fe-insta/src/lib/session/server/use-cases/refresh";
import { readTestWebConfig } from "../environment";

const args = z
  .tuple([
    z.uuid(),
    z.string().regex(/^test_bff_[a-f0-9]+$/),
    z.coerce.number(),
  ])
  .parse(process.argv.slice(2));
const [bindingId, collectionName, now] = args;
const config = readTestWebConfig();
const database = await connectDatabase({ config: config.mongo });
const store = createMongoSessionStore(database.webDb, collectionName);
try {
  const initial = await store.read(bindingId);
  if (!initial) throw new Error("Missing owned binding");
  const outcome = await refreshBinding(
    { bindingId, revision: initial.revision },
    {
      store,
      crypto: createSessionCrypto(config.sessionKeys),
      clock: () => now,
      id: () => crypto.randomUUID(),
      wait: Bun.sleep,
      backend: {
        refresh: async ({ key }): ReturnType<BackendAuth["refresh"]> => {
          process.stdout.write(`${JSON.stringify({ entered: true, key })}\n`);
          const reply = z
            .enum(["success", "invalid", "revoked"])
            .parse((await Bun.stdin.text()).trim());
          if (reply === "invalid")
            return Result.Error({ code: "REFRESH_TOKEN_INVALID" });
          if (reply === "revoked")
            return Result.Error({ code: "SESSION_REVOKED" });
          return Result.Ok({
            user: initial.user,
            backendSessionId: initial.backendSessionId,
            absoluteExpiresAt: initial.absoluteExpiresAt,
            expiresAt: initial.expiresAt,
            accessExpiresAt: now + 1000,
            accessToken: "synthetic-access",
            refreshToken: "synthetic-refresh",
          });
        },
        authorize: async (): ReturnType<BackendAuth["authorize"]> =>
          Result.Error({ code: "UNUSED" }),
        revoke: async (): ReturnType<BackendAuth["revoke"]> =>
          Result.Error({ code: "UNUSED" }),
      },
    },
  );
  process.stdout.write(
    `${JSON.stringify(outcome.isOk() ? { revision: outcome.get().revision } : { error: outcome.getError() })}\n`,
  );
} finally {
  await database.close();
}
