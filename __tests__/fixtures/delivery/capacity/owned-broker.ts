import { cleanupResources } from "../../../../scripts/testing/cleanup";
import type { OwnedResource } from "../../../../scripts/testing/types";
import { docker } from "../../docker";
import { startBroker } from "../../isolated-broker";
/** Создаёт самостоятельный labelled broker; restart/cleanup ограничены его именем и volume. */
export const ownCapacityBroker = async (
  capacity: Parameters<typeof startBroker>[3],
) => {
  const name = `insta-chat03-${crypto.randomUUID()}`;
  await docker("volume", "create", "--label", `insta.testRunId=${name}`, name);
  const resources: OwnedResource[] = [{ kind: "volume", id: name }];
  try {
    let current = await startBroker(name, resources, undefined, capacity);
    return {
      current: () => current,
      restart: async () => {
        current.client.close();
        await docker("kill", "--signal", "KILL", name);
        await docker("rm", name);
        resources.pop();
        current = await startBroker(name, resources, undefined, capacity);
        return current;
      },
      close: async () => {
        current.client.close();
        await cleanupResources({ testRunId: name, resources, execute: docker });
      },
    };
  } catch (error) {
    await cleanupResources({ testRunId: name, resources, execute: docker });
    throw error;
  }
};
