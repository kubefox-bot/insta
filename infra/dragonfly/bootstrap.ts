import {
  bootstrapGeneration,
  connectDragonfly,
} from "../../apps/be-insta/src/lib/dragonfly/index";
import { readBrokerConfig } from "./config";

const client = await connectDragonfly({ config: readBrokerConfig() });
try {
  await bootstrapGeneration(client);
  process.stdout.write("Broker generation bootstrapped\n");
} finally {
  client.close();
}
