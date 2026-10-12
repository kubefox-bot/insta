import type { RedisClient } from "bun";
import { savePreference } from "../../../apps/be-insta/src/domains/privacy/index";
import {
  createDragonflyPreferences,
  createRandom,
} from "../../../apps/be-insta/src/domains/privacy/server/index";
import { encryptConsentCookie } from "../../../apps/fe-insta/src/domains/privacy/server/cookie";
import { readTestWebConfig } from "../environment";
export const createAnalyticsConsent = async ({
  broker,
  source,
  ownedKeys,
}: Readonly<{
  broker: RedisClient;
  source: string;
  ownedKeys: Set<string>;
}>) => {
  const adapter = createDragonflyPreferences(broker);
  const preferences = {
    ...adapter,
    save: async (input: Parameters<typeof adapter.save>[0]) => {
      ownedKeys.add(
        `auth:${input.preference.generation}:privacy:preference:${input.preference.contextId}`,
      );
      ownedKeys.add(
        `auth:${input.preference.generation}:privacy:rate:${input.source}`,
      );
      return adapter.save(input);
    },
  };
  const result = await savePreference(
    { choice: "all", policyVersion: 1, source },
    { preferences, clock: Date.now, random: createRandom() },
  );
  if (result.isError()) throw new Error(result.getError());
  const { preference, contextProof } = result.get();
  return {
    cookie: await encryptConsentCookie({
      contextProof,
      expiresAt: preference.expiresAt,
      key: readTestWebConfig().privacyEncryptionKey,
    }),
  };
};
