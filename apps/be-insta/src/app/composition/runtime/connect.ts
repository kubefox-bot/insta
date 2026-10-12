import type { readRuntimeConfig } from "../../../lib/config/index";
import { createClientSourceReader } from "../../../lib/http/index";
import { startMailWorkers } from "../../workers/index";
import { createAnalyticsDependencies } from "../analytics/index";
import { createPrivacyDependencies } from "../privacy/index";
import { createStoriesRuntime } from "../stories/index";
import { createDomainDependencies } from "./domains";
import { connectRuntimeInfrastructure } from "./infrastructure";
import { runtimeClose } from "./lifetime";
import { createRuntimeReadiness } from "./readiness";
import { stopRuntimeWorkers } from "./stop-workers";
import type { RuntimeDependencies } from "./types";
/** Подключает инфраструктуру и capabilities, запускает workers и возвращает readiness/teardown; при ошибке освобождает уже приобретённые ресурсы. */
export const connectDependencies = async (
  config: ReturnType<typeof readRuntimeConfig>,
): Promise<RuntimeDependencies> => {
  await using resources = new AsyncDisposableStack();
  const infrastructure = await connectRuntimeInfrastructure(config);
  resources.defer(infrastructure.close);
  const { database, broker, deliveryBroker, authIdentity } = infrastructure;
  const { users, support, chat, directory, findPublicUser } =
    await createDomainDependencies({
      config,
      database,
      broker,
      deliveryBroker,
    });
  resources.defer(() => chat.realtime.streams.close());
  const stories = await createStoriesRuntime({
    config: config.stories,
    realtime: chat.realtime,
    broker,
    quotaKey: config.bffSourceSigningKey,
    database,
    authors: { findPublicUser },
  });
  resources.defer(async () => {
    await stories?.close();
  });
  const workers = startMailWorkers({ config, broker, users, support });
  /** Запрашивает остановку mail и optional Stories workers через общий settlement owner. */
  const stopWorkers = () =>
    stopRuntimeWorkers({ mail: workers.close, stories: stories?.close });
  resources.defer(stopWorkers);
  const privacy = createPrivacyDependencies(broker);
  const readiness = createRuntimeReadiness({
    config,
    database,
    broker,
    authIdentity,
    mailStatus: workers.status,
  });
  const dependencies = {
    stopWorkers,
    stories,
    realtimeOrigin: config.realtimeOrigin,
    chat,
    directory,
    users,
    support,
    clientSource: createClientSourceReader({
      key: config.bffSourceSigningKey,
      clock: Date.now,
    }),
    privacy,
    analytics: {
      ...createAnalyticsDependencies({ database, privacy }),
      receiver: config.otelReceiver,
    },
    ...readiness,
  };
  const lifetime = resources.move();
  return { ...dependencies, close: runtimeClose(lifetime) };
};
