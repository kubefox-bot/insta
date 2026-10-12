import type { readRuntimeConfig } from "../../../lib/config/index";
import { connectDatabase } from "../../../lib/database/index";
import {
  connectDragonfly,
  createDeliveryConnection,
  readBrokerIdentity,
} from "../../../lib/dragonfly/index";
/** Приобретает infrastructure clients; delivery подключается lazy, cleanup освобождает только собственные ресурсы в обратном порядке. */
export const connectRuntimeInfrastructure = async (
  config: ReturnType<typeof readRuntimeConfig>,
) => {
  await using resources = new AsyncDisposableStack();
  const database = await connectDatabase({ config: config.mongo });
  resources.defer(() => database.close());
  const broker = await connectDragonfly({ config: config.dragonfly });
  resources.defer(() => broker.close());
  const authIdentity = await readBrokerIdentity(broker);
  const deliveryBroker = createDeliveryConnection({
    config: config.deliveryDragonfly,
    authIdentity,
  });
  resources.defer(deliveryBroker.close);
  const lifetime = resources.move();
  return {
    database,
    broker,
    deliveryBroker,
    authIdentity,
    close: () => lifetime.disposeAsync(),
  };
};
