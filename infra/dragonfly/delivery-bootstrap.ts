import { RedisClient } from "bun";
import { deliveryStreamsNamespace } from "../../apps/be-insta/src/domains/conversations/server/index";
import { bootstrapNamespaceGeneration } from "../../apps/be-insta/src/lib/dragonfly/index";
import { readDeliveryBrokerConfig } from "./config";

const config = readDeliveryBrokerConfig();
const client = new RedisClient(config.url, {
  autoReconnect: false,
  enableOfflineQueue: false,
  connectionTimeout: config.timeoutMs,
});
const timer = setTimeout(() => client.close(), config.timeoutMs);
try {
  await client.connect();
  await bootstrapNamespaceGeneration({
    client,
    namespace: deliveryStreamsNamespace,
  });
  process.stdout.write("Delivery generation bootstrapped\n");
} catch {
  process.stderr.write(
    "Delivery bootstrap unavailable; infrastructure retry owns recovery\n",
  );
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
  client.close();
}
