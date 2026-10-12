import { z } from "zod";
import { readGeneration } from "../../../apps/be-insta/src/lib/dragonfly/index";
import { createTestEnvironment } from "../../fixtures/environment";

const [mode, identity] = z
  .tuple([z.enum(["seed", "read", "cleanup"]), z.uuid()])
  .parse(process.argv.slice(2));
const environment = await createTestEnvironment({
  testRunId: `fnd04-${identity}`,
});
try {
  const api = environment.api.apiDb.collection(environment.collection);
  const web = environment.web.webDb.collection(environment.collection);
  if (mode === "cleanup") {
    await environment.dispose();
  } else {
    if (mode === "seed") {
      await api.insertOne({ identity });
      await web.insertOne({ identity });
    }
    console.log(
      JSON.stringify({
        api: await api.countDocuments({ identity }),
        web: await web.countDocuments({ identity }),
        generation: await readGeneration(environment.broker),
      }),
    );
  }
} finally {
  if (mode !== "cleanup") {
    environment.broker.close();
    await Promise.all([environment.api.close(), environment.web.close()]);
  }
}
