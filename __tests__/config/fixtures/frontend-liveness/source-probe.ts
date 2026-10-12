import { readTrustedClientSource } from "../../../../apps/fe-insta/src/app/infrastructure/server/client-source/index";
import { installSyntheticWebConfiguration } from "./config";

const invalidConfigurationRejected = await (async () => {
  try {
    await readTrustedClientSource({ peer: "127.0.0.1" });
    return false;
  } catch (error) {
    return (
      error instanceof Error &&
      error.message.startsWith("Invalid web configuration")
    );
  }
})();
installSyntheticWebConfiguration();
console.log(
  JSON.stringify({
    imported: true,
    invalidConfigurationRejected,
    direct: await readTrustedClientSource({
      peer: "127.0.0.1",
      forwardedFor: "198.51.100.4",
    }),
    normalized: await readTrustedClientSource({ peer: "::ffff:127.0.0.1" }),
    invalid: await readTrustedClientSource({ peer: "not-an-address" }),
  }),
);
