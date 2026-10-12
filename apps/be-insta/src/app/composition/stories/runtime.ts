import type { RedisClient } from "bun";
import {
  createStoryMaintenance,
  createStoryPublisherLifetime,
  type StoryDependencies,
} from "../../../domains/stories/index";
import { createStoryJobs } from "../../../domains/stories/server/index";
import type { connectDatabase } from "../../../lib/database/index";
import type { createConversationsDependencies } from "../conversations/index";
import { closeStoriesResources } from "./close";
import { createStoriesInfrastructure } from "./create";
import { createStoryDelivery } from "./delivery";
import { createPublicationFeed } from "./publication-feed";
import { createStoryReads } from "./reads";
import type { StoriesConfiguration } from "./types";
/** Собирает Stories persistence, policy, storage, feed и maintenance; запускает jobs и владеет остановкой публикаций перед media cleanup. */
export const createStoriesRuntime = async ({
  config,
  database,
  authors,
  broker,
  quotaKey,
  realtime,
}: Readonly<{
  config: StoriesConfiguration;
  realtime: Awaited<
    ReturnType<typeof createConversationsDependencies>
  >["realtime"];
  broker: RedisClient;
  quotaKey: string;
  database: Awaited<ReturnType<typeof connectDatabase>>;
  authors: StoryDependencies["authors"];
}>) => {
  if (config.mode === "disabled") return null;
  const active = config.profiles.find(({ id }) => id === config.activeProfile);
  if (!active) throw new Error("Stories active profile missing");
  const { persistence, ...delivery } = await createStoryDelivery({
    database,
    realtime,
  });
  const clock = Date.now;
  const infrastructure = createStoriesInfrastructure({ config, clock });
  if (!infrastructure) throw new Error("Stories infrastructure unavailable");
  const publicationFeed = createPublicationFeed(broker);
  const dependencies: StoryDependencies = {
    ...persistence,
    policy: config.policy,
    media: infrastructure.mediaInspector,
    storage: infrastructure.storage,
    authors,
    refreshFeed: publicationFeed.refresh,
    publicationDelivery: publicationFeed.delivery((signal) =>
      maintenance.invalidate(signal),
    ),
    activeProfile: active.id,
    keyPrefix: active.prefix,
    clock,
    /** Создаёт уникальный идентификатор попытки публикации для lease и ключа объекта. */
    uuid: () => crypto.randomUUID(),
  };
  const publisher = createStoryPublisherLifetime(dependencies);

  const maintenance = createStoryMaintenance({
    ...persistence,
    storage: infrastructure.storage,
    profiles: config.profiles,
    clock,
    invalidate: publicationFeed.invalidate,
    notify: delivery.notify,
  });
  const jobs = createStoryJobs(maintenance);
  jobs.start();
  return {
    ...infrastructure,
    status: jobs.status,
    reads: createStoryReads({
      persistence,
      broker,
      authors,
      quotaKey,
      clock,
    }),
    publication: { ...dependencies, publish: publisher.publish },
    /** Ждёт закрытия publisher и maintenance jobs перед остановкой media inspector; ошибка ожидания передаётся вызывающему коду. */
    close: () =>
      closeStoriesResources({
        publisher: publisher.close,
        jobs: jobs.close,
        publicationFeed: publicationFeed.close,
        infrastructure: infrastructure.close,
      }),
  };
};
