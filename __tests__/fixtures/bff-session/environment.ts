import { Result } from "@bloodyowl/boxed";
import {
  authorizeSession,
  login,
  refresh,
  revokeSession,
} from "../../../apps/be-insta/src/domains/users/auth/index";
import { connectDatabase } from "../../../apps/fe-insta/src/lib/database/server/index";
import { createSessionCrypto } from "../../../apps/fe-insta/src/lib/session/server/adapters/jose/crypto";
import { createMongoSessionStore } from "../../../apps/fe-insta/src/lib/session/server/adapters/mongo/store";
import type { BackendAuth } from "../../../apps/fe-insta/src/lib/session/server/ports/backend-auth";
import type { SessionDependencies } from "../../../apps/fe-insta/src/lib/session/server/ports/dependencies";
import { createBinding } from "../../../apps/fe-insta/src/lib/session/server/use-cases/create-binding";
import { readTestWebConfig } from "../environment";
import { createAuthEnvironment } from "../users/auth-environment";
export const createBffEnvironment = async () => {
  const native = await createAuthEnvironment();
  const config = readTestWebConfig();
  const web = await connectDatabase({ config: config.mongo });
  const ids: string[] = [];
  const collectionName = `test_bff_${crypto.randomUUID().replaceAll("-", "")}`;
  const dependencies: SessionDependencies = {
    store: createMongoSessionStore(web.webDb, collectionName),
    crypto: createSessionCrypto(config.sessionKeys),
    clock: native.clock,
    id: () => crypto.randomUUID(),
    wait: async (ms) => {
      native.advance(ms);
    },
    backend: {
      refresh: async ({
        refreshToken,
        key,
      }): ReturnType<BackendAuth["refresh"]> => {
        const response = await refresh(
          {
            refreshToken,
            idempotencyKey: key,
            operationId: native.operation(),
          },
          native.auth,
        );
        return response.isOk()
          ? Result.Ok(response.get().credentials)
          : Result.Error({ code: response.getError() });
      },
      revoke: async ({
        backendSessionId,
        revokeSecret,
      }): ReturnType<BackendAuth["revoke"]> => {
        const response = await revokeSession(
          {
            backendSessionId: backendSessionId as typeof native.sessionId,
            revokeSecret,
          },
          native.auth,
        );
        return response.isOk()
          ? Result.Ok({ state: response.get().state })
          : Result.Error({ code: response.getError() });
      },
      authorize: async (accessToken): ReturnType<BackendAuth["authorize"]> => {
        const response = await authorizeSession({ accessToken }, native.auth);
        return response.isOk()
          ? Result.Ok(response.get())
          : Result.Error({ code: response.getError() });
      },
    },
  };
  return {
    native,
    web,
    dependencies,
    config,
    collectionName,
    binding: async () => {
      const account = await native.account();
      const logged = await login(
        { ...account, operationId: native.operation() },
        native.auth,
      );
      if (logged.isError()) throw new Error(logged.getError());
      const binding = await createBinding(
        logged.get().credentials,
        dependencies,
      );
      if (binding.isError()) throw new Error(binding.getError());
      ids.push(binding.get().bindingId);
      return binding.get();
    },
    dispose: async () => {
      try {
        const users = await native.db
          .collection("users")
          .find({ emailKey: { $regex: `^${native.runId}-` } })
          .toArray();
        const ownedIds = users.map((user) => user._id);
        await native.db
          .collection("users_outbox")
          .deleteMany({ userId: { $in: ownedIds } });
        await web.webDb.collection("bff_sessions").deleteMany({
          "user.id": { $in: ownedIds.map((id) => id.toHexString()) },
        });
        await web.webDb
          .collection(collectionName)
          .drop()
          .catch((error: unknown) => {
            if (
              !(error instanceof Error) ||
              !("code" in error) ||
              error.code !== 26
            )
              throw error;
          });
      } finally {
        await web.close();
        await native.dispose();
      }
    },
  };
};
