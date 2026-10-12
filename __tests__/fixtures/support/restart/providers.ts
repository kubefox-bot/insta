import { readInfraConfig } from "../../../../scripts/infra/config";
import type { OwnedResource } from "../../../../scripts/testing/types";
import { readAuthFixtureConfig } from "../../auth05/config";
import { waitUntil } from "../../barrier";
import { docker } from "../../docker";
import { startBroker } from "../../isolated-broker";

const mongoImage =
  "mongo:8.0.15@sha256:f4d54619262ae3bc6a0a8efbebcef970b87b8ad70697479a75ce308a6f400158";
const mailImage =
  "axllent/mailpit:v1.27.10@sha256:b1f1be18af530d939a11ee8820b379e0c88eeec204d904bfad68862adced3a5a";
export const ownedContainerAction = async (
  runId: string,
  id: string,
  action: "restart" | "stop",
) => {
  if (
    (await docker(
      "container",
      "inspect",
      "--format",
      '{{index .Config.Labels "insta.testRunId"}}',
      id,
    )) !== runId
  )
    throw new Error("Refusing foreign restart");
  await docker(action, "--timeout", "5", id);
};
export const waitMongo = async (id: string) =>
  waitUntil({
    timeoutMs: 30000,
    check: async () => {
      try {
        return (
          (await docker(
            "exec",
            id,
            "mongosh",
            "--quiet",
            "--eval",
            "db.hello().isWritablePrimary",
          )) === "true"
        );
      } catch {
        return false;
      }
    },
  });
export const startRestartProviders = async (
  runId: string,
  resources: OwnedResource[],
) => {
  const network = `${runId}-network`;
  const label = `insta.testRunId=${runId}`;
  resources.push({
    kind: "network",
    id: await docker("network", "create", "--label", label, network),
  });
  const volume = `${runId}-mongo-data`;
  resources.push({
    kind: "volume",
    id: await docker("volume", "create", "--label", label, volume),
  });
  resources.push({
    kind: "volume",
    id: await docker("volume", "create", "--label", label, runId),
  });
  const mongo = await docker(
    "run",
    "-d",
    "--name",
    `${runId}-mongo`,
    "--label",
    label,
    "--network",
    network,
    "--network-alias",
    "support-mongo",
    "--memory",
    "512m",
    "--cpus",
    "1",
    "-p",
    "127.0.0.1::27017",
    "-v",
    `${volume}:/data/db`,
    "--tmpfs",
    "/data/configdb",
    mongoImage,
    "--replSet",
    "rs0",
    "--bind_ip_all",
  );
  resources.push({ kind: "container", id: mongo });
  await waitUntil({
    timeoutMs: 30000,
    check: async () => {
      try {
        return (
          (await docker(
            "exec",
            mongo,
            "mongosh",
            "--quiet",
            "--eval",
            "db.adminCommand({ping:1}).ok",
          )) === "1"
        );
      } catch {
        return false;
      }
    },
  });
  await docker(
    "exec",
    mongo,
    "mongosh",
    "--quiet",
    "--eval",
    'rs.initiate({_id:"rs0",members:[{_id:0,host:"support-mongo:27017"}]})',
  );
  await waitMongo(mongo);
  const broker = await startBroker(runId, resources, {
    name: network,
    alias: "support-broker",
  });
  broker.client.close();
  const mail = await docker(
    "run",
    "-d",
    "--name",
    `${runId}-mailpit`,
    "--label",
    label,
    "--network",
    network,
    "--network-alias",
    "support-mailpit",
    "--memory",
    "128m",
    "-p",
    "127.0.0.1::8025",
    mailImage,
  );
  resources.push({ kind: "container", id: mail });
  const port = async (id: string, internal: string) =>
    (await docker("port", id, internal)).split(":").at(-1);
  const mailUrl = `http://127.0.0.1:${await port(mail, "8025/tcp")}`;
  await waitUntil({
    check: async () => {
      try {
        const response = await fetch(`${mailUrl}/readyz`);
        await response.body?.cancel();
        return response.ok;
      } catch {
        return false;
      }
    },
  });
  const workerImage = await docker(
    "image",
    "inspect",
    "--format",
    "{{.Id}}",
    `${readInfraConfig().project}-testhost`,
  );
  return {
    network,
    mongo,
    broker: runId,
    mailUrl,
    mongoUrl: `mongodb://127.0.0.1:${await port(mongo, "27017/tcp")}/?replicaSet=rs0&directConnection=true`,
    brokerUrl: broker.url,
    workerImage,
  };
};
export const startRestartWorker = async (
  runId: string,
  providers: Awaited<ReturnType<typeof startRestartProviders>>,
  resources: OwnedResource[],
  {
    execute = docker,
    configuration = readAuthFixtureConfig(),
  }: Readonly<{
    execute?: typeof docker;
    configuration?: ReturnType<typeof readAuthFixtureConfig>;
  }> = {},
) => {
  if (configuration.image && configuration.image !== providers.workerImage)
    throw new Error("Restart worker exact image mismatch");
  const id = await execute(
    "run",
    "-d",
    "--name",
    `${runId}-worker`,
    "--label",
    `insta.testRunId=${runId}`,
    "--network",
    providers.network,
    "--memory",
    "384m",
    "--cpus",
    "0.5",
    ...(configuration.image
      ? []
      : ["-v", `${process.cwd()}/__tests__:/workspace/__tests__:ro`]),
    providers.workerImage,
    "bun",
    "__tests__/fixtures/support/restart/worker.ts",
    runId,
  );
  resources.push({ kind: "container", id });
  await waitUntil({
    check: async () =>
      (await execute("logs", id)).includes("support-restart-worker-ready"),
  });
  return id;
};
