import { expect, test } from "bun:test";
import { readInfraConfig } from "../../scripts/infra/config";
import { cleanupResources } from "../../scripts/testing/cleanup";
import type { OwnedResource } from "../../scripts/testing/types";
import { bootstrapDeliveryBroker } from "../fixtures/delivery/bootstrap";
import { docker } from "../fixtures/docker";
import { startBroker } from "../fixtures/isolated-broker";

test("idle zero-claim retention uses an isolated physical delivery broker and real Mongo namespace", async () => {
  await using lifetime = new AsyncDisposableStack();
  const runId = `insta-chat03-${crypto.randomUUID()}`;
  const resources: OwnedResource[] = [];
  lifetime.defer(() =>
    cleanupResources({ testRunId: runId, resources, execute: docker }),
  );
  await docker(
    "volume",
    "create",
    "--label",
    `insta.testRunId=${runId}`,
    runId,
  );
  resources.push({ kind: "volume", id: runId });
  const broker = await startBroker(runId, resources, undefined, {
    maxMemory: "1gb",
    containerMemoryMb: 1536,
  });
  lifetime.defer(() => broker.client.close());
  await bootstrapDeliveryBroker(broker.client);
  const project = readInfraConfig().project;
  const network = `${project}_default`;
  const owner = await docker(
    "network",
    "inspect",
    "--format",
    '{{index .Labels "com.docker.compose.project"}}',
    network,
  );
  if (owner !== project)
    throw new Error("Refusing foreign application network");
  await docker("network", "connect", network, runId);
  const probe =
    'const child=Bun.spawn([process.execPath,"test","./__tests__/integration/conversations/delivery-maintenance.test.ts","--timeout","30000"],{stdout:"pipe",stderr:"pipe"});const [code,out,err]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()]);console.log(out+err);process.exit(code);';
  const output = await docker(
    "compose",
    "--project-name",
    project,
    "run",
    "--rm",
    "--no-deps",
    "--pull",
    "never",
    "--env",
    `DELIVERY_DRAGONFLY_URL=redis://:isolated-synthetic@${runId}:6379`,
    "--workdir",
    "/workspace/apps/be-insta",
    "testhost",
    "bun",
    "-e",
    probe,
  );
  expect(output).toContain("1 pass");
  expect(output).toContain("0 fail");
}, 90000);
