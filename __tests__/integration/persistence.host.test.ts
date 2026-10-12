import { expect, test } from "bun:test";
import { readInfraConfig } from "../../scripts/infra/config";
import { waitUntil } from "../fixtures/barrier";
import { docker } from "../fixtures/docker";

const compose = (...args: string[]) =>
  docker("compose", "--project-name", readInfraConfig().project, ...args);
const observe = async (
  collection: string,
  operation: "write" | "read" | "drop",
) => {
  const script = `import {readRuntimeConfig} from './src/lib/config/index';import {connectDatabase} from './src/lib/database/index';import {connectDragonfly,readGeneration} from './src/lib/dragonfly/index';const c=readRuntimeConfig();const d=await connectDatabase({config:c.mongo});const r=await connectDragonfly({config:c.dragonfly});try{const records=d.apiDb.collection(${JSON.stringify(collection)});${{ write: "await records.insertOne({proof:'persisted'})", read: "if(!(await records.findOne({proof:'persisted'})))throw Error('Persistence lost')", drop: "await records.drop()" }[operation]};console.log(JSON.stringify({generation:await readGeneration(r)}));}finally{r.close();await d.close()}`;
  return JSON.parse(
    await compose(
      "run",
      "--rm",
      "--no-deps",
      "--pull",
      "never",
      "--workdir",
      "/workspace/apps/be-insta",
      "testhost",
      "bun",
      "-e",
      script,
    ),
  );
};
test("application and Mongo restart preserve run-owned persistent data and live broker generation", async () => {
  const collection = `test_fnd04_${crypto.randomUUID().replaceAll("-", "_")}`;
  const before = await observe(collection, "write");
  try {
    await compose("restart", "mongo", "be-insta", "fe-insta");
    await waitUntil({
      timeoutMs: 60000,
      check: async () => {
        try {
          return (
            (await compose(
              "exec",
              "-T",
              "fe-insta",
              "bun",
              "-e",
              'console.log((await fetch("http://localhost:3000/api/health/ready")).status)',
            )) === "200"
          );
        } catch {
          return false;
        }
      },
    });
    expect((await observe(collection, "read")).generation).toBe(
      before.generation,
    );
  } finally {
    await observe(collection, "drop");
  }
}, 90000);
