import { fixturePort } from "../auth05/conts";
import { cleanupBrowserBindings } from "./browser-host/bindings";
import { startBrowserHost } from "./browser-host/start";
import { createBffEnvironment } from "./environment";
import { createSessionFaultRouter } from "./faults/router";

const starting = startBrowserHost({
  createFixture: createBffEnvironment,
  createFaults: createSessionFaultRouter,
  cleanupBindings: cleanupBrowserBindings,
  serve: ({ fixture, account, secondAccount, faults }) => {
    const server = Bun.serve({
      hostname: "0.0.0.0",
      port: fixturePort,
      fetch: (request) =>
        new URL(request.url).pathname === "/"
          ? Response.json({
              account,
              secondAccount,
              signupEmail: fixture.native.email("signup"),
              noJsEmail: fixture.native.email("nojs"),
            })
          : faults.request(request),
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
