import { createRegistrationCrypto } from "../../../apps/be-insta/src/domains/users/auth/adapters/registration/jose/crypto";
import {
  connectDragonfly,
  readGeneration,
} from "../../../apps/be-insta/src/lib/dragonfly/index";
import { createBffEnvironment } from "../bff-session/environment";
import { readTestApiConfig } from "../environment";
import { createMailObserver } from "../registration/mailpit";
import { fixturePort } from "./conts";
import { cleanupChallenges } from "./host/challenges";
import { startAuthHost } from "./host/start";

const config = readTestApiConfig();
const starting = startAuthHost({
  createFixture: createBffEnvironment,
  createRegistration: async (emails) => {
    const broker = await connectDragonfly({ config: config.dragonfly });
    try {
      const generation = await readGeneration(broker);
      const cryptography = createRegistrationCrypto(config.authSigningKey);
      return {
        cleanup: () =>
          cleanupChallenges({ broker, generation, cryptography, emails }),
        close: () => broker.close(),
      };
    } catch (error) {
      broker.close();
      throw error;
    }
  },
  createObserver: (emails) =>
    createMailObserver({ url: config.mailpitUrl, emails }),
  serve: (credentials) => {
    const server = Bun.serve({
      hostname: "0.0.0.0",
      port: fixturePort,
      fetch: () => Response.json(credentials),
    });
    return {
      stop: async () => {
        await server.stop(true);
      },
    };
  },
});
process.once("SIGTERM", () => {
  starting
    .then((host) => host.dispose())
    .then(
      () => process.exit(0),
      () => process.exit(1),
    );
});
await starting;
