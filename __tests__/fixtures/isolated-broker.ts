import { RedisClient } from "bun";
import type { OwnedResource } from "../../scripts/testing/types";
import { waitUntil } from "./barrier";
import { docker } from "./docker";

const image =
  "docker.dragonflydb.io/dragonflydb/dragonfly:v1.34.2@sha256:d5312167ab5125f916218e71994323800926038eb284e2da8ed41d47e9c2b44e";
export const startBroker = async (
  name: string,
  resources: OwnedResource[],
  network?: Readonly<{ name: string; alias: string }>,
  capacity: Readonly<{
    maxMemory: "256mb" | "1gb";
    containerMemoryMb?: number;
  }> = { maxMemory: "256mb" },
) => {
  if (network && network.name !== `${name}-network`)
    throw new Error("Refusing foreign broker network");
  const id = await docker(
    "run",
    "-d",
    "--name",
    name,
    "--label",
    `insta.testRunId=${name}`,
    ...(network
      ? ["--network", network.name, "--network-alias", network.alias]
      : []),
    ...(capacity.containerMemoryMb
      ? ["--memory", `${capacity.containerMemoryMb}m`]
      : []),
    "-p",
    "127.0.0.1::6379",
    "-v",
    `${name}:/data`,
    image,
    "--proactor_threads=1",
    `--maxmemory=${capacity.maxMemory}`,
    "--requirepass=isolated-synthetic",
    "--dir=/data",
    "--dbfilename=snapshot",
    "--logtostderr",
  );
  resources.push({ kind: "container", id });
  const port = (await docker("port", name, "6379/tcp")).split(":").at(-1);
  const url = `redis://:isolated-synthetic@127.0.0.1:${port}`;
  await waitUntil({
    check: async () => {
      const client = new RedisClient(url, {
        autoReconnect: false,
        connectionTimeout: 500,
      });
      try {
        await client.connect();
        return (await client.send("PING", [])) === "PONG";
      } catch {
        return false;
      } finally {
        client.close();
      }
    },
  });
  return {
    client: new RedisClient(url, {
      autoReconnect: false,
      connectionTimeout: 2000,
    }),
    url,
  };
};
