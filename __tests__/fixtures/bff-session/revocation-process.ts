import { Result } from "@bloodyowl/boxed";
import { z } from "zod";
import { revokeSession } from "../../../apps/be-insta/src/domains/users/auth/index";
import { connectDatabase } from "../../../apps/fe-insta/src/lib/database/server/index";
import { createSessionCrypto } from "../../../apps/fe-insta/src/lib/session/server/adapters/jose/crypto";
import { createMongoSessionStore } from "../../../apps/fe-insta/src/lib/session/server/adapters/mongo/store";
import type { BackendAuth } from "../../../apps/fe-insta/src/lib/session/server/ports/backend-auth";
import { retryPendingRevocations } from "../../../apps/fe-insta/src/lib/session/server/use-cases/retry-revocation";
import { readTestWebConfig } from "../environment";
import { createAuthEnvironment } from "../users/auth-environment";

const [collectionName, now] = z
  .tuple([z.string().regex(/^test_bff_[a-f0-9]+$/), z.coerce.number()])
  .parse(process.argv.slice(2));
const native = await createAuthEnvironment();
native.advance(now - native.clock());
const config = readTestWebConfig();
const web = await connectDatabase({ config: config.mongo });
try {
  await retryPendingRevocations({
    store: createMongoSessionStore(web.webDb, collectionName),
    crypto: createSessionCrypto(config.sessionKeys),
    clock: native.clock,
    backend: {
      revoke: async ({
        backendSessionId,
        revokeSecret,
      }): ReturnType<BackendAuth["revoke"]> => {
        const response = await revokeSession(
          {
            backendSessionId: backendSessionId as typeof native.sessionId,
            revokeSecret,
          },
          { ...native.auth, operationId: () => crypto.randomUUID() },
        );
        return response.isOk()
          ? Result.Ok({ state: response.get().state })
          : Result.Error({ code: response.getError() });
      },
    },
  });
} finally {
  await web.close();
  await native.dispose();
}
