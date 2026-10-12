import type { RedisClient } from "bun";
import { deliveryStreamsNamespace } from "../../../apps/be-insta/src/domains/conversations/server/index";
import { bootstrapNamespaceGeneration } from "../../../apps/be-insta/src/lib/dragonfly/index";
/** Использует production bootstrap только для независимого delivery namespace. */
export const bootstrapDeliveryBroker = (client: RedisClient) =>
  bootstrapNamespaceGeneration({ client, namespace: deliveryStreamsNamespace });
