import { createRegistrationEnvironment } from "../../../../__tests__/fixtures/registration/environment";
import { createApplication } from "../../src/app/bootstrap";
import { startRegistrationWorker } from "../../src/domains/users/auth/adapters/registration/worker";

const f = await createRegistrationEnvironment();
const email = f.email("browser-observer");
f.ownEmail(email);
const worker = startRegistrationWorker({
  jobs: f.jobs,
  crypto: f.dependencies.crypto,
  sender: f.sender,
  clock: f.clock,
  registration: { ...f.dependencies.registration, expired: async () => [] },
});
const app = await createApplication(
  {
    users: { ...f.users, registration: f.dependencies },
    checkRequired: async () => true,
    check: async () => ({ ready: true, mail: "ok", delivery: "ok" }),
    close: async () => {
      await worker.close();
      await f.dispose();
    },
  },
  { mode: "offline" },
);
// Test transport only, never imported by a normal entrypoint or build.
app
  .getHttpAdapter()
  .get(
    "/__tests__/fixture",
    (_request: unknown, response: { json: (value: unknown) => void }) =>
      response.json({ email }),
  );
await app.listen(3001, "0.0.0.0");
const stop = async () => {
  await app.close();
  process.exit(0);
};
process.on("SIGTERM", () => {
  stop().catch(() => process.exit(1));
});
