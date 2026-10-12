import { startStoryHost } from "./host/start";

const starting = startStoryHost();
process.once("SIGTERM", () => {
  starting
    .then((host) => host.dispose())
    .then(
      () => process.exit(0),
      () => process.exit(1),
    );
});
await starting;
