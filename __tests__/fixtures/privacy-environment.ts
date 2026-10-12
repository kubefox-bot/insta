import { createDragonflyPreferences } from "../../apps/be-insta/src/domains/privacy/adapters/dragonfly/preferences";
import { createRandom } from "../../apps/be-insta/src/domains/privacy/adapters/proof";
import {
  connectDragonfly,
  readGeneration,
} from "../../apps/be-insta/src/lib/dragonfly/index";
import { readTestApiConfig } from "./environment";
export const createPrivacyEnvironment = async () => {
  const broker = await connectDragonfly({
    config: readTestApiConfig().dragonfly,
  });
  const adapter = createDragonflyPreferences(broker);
  const keys = new Set<string>();
  const source = `priv01-${crypto.randomUUID()}`;
  const preferences = {
    ...adapter,
    save: async (input: Parameters<typeof adapter.save>[0]) => {
      keys.add(
        `auth:${input.preference.generation}:privacy:preference:${input.preference.contextId}`,
      );
      keys.add(
        `auth:${input.preference.generation}:privacy:rate:${input.source}`,
      );
      return adapter.save(input);
    },
  };
  const generation = await readGeneration(broker);
  const dependencies = { preferences, clock: Date.now, random: createRandom() };
  return {
    broker,
    generation,
    source,
    dependencies,
    dispose: async () => {
      try {
        for (const key of keys) await broker.del(key);
      } finally {
        broker.close();
      }
    },
  };
};
