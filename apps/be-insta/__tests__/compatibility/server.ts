import { createApplication } from "../../src/app/bootstrap";
import { readCompatibilityConfig } from "./config";

const config = readCompatibilityConfig();
const app = await createApplication({
  checkRequired: async () => true,
  check: async () => ({ ready: true, mail: "ok", delivery: "ok" }),
  close: async () => {},
});
app.enableShutdownHooks();
await app.listen(config.port, config.host);
