import { readTestApiConfig } from "../../../../__tests__/fixtures/environment";
import { createPrivacyEnvironment } from "../../../../__tests__/fixtures/privacy-environment";
import { createApplication } from "../../src/app/bootstrap";
import { createClientSourceReader } from "../../src/lib/http/index";

const fixture = await createPrivacyEnvironment();
const app = await createApplication(
  {
    privacy: fixture.dependencies,
    clientSource: createClientSourceReader({
      key: readTestApiConfig().bffSourceSigningKey,
      clock: Date.now,
    }),
    checkRequired: async () => true,
    check: async () => ({ ready: true, mail: "ok", delivery: "ok" }),
    close: fixture.dispose,
  },
  { mode: "runtime", ...readTestApiConfig().observability },
);
app.enableShutdownHooks();
await app.listen(3001, "0.0.0.0");
