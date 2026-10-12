import { expect, test } from "bun:test";
import { resolve } from "node:path";
import {
  secureDirectory,
  writePrivateFile,
} from "../../scripts/infra/artifacts";
import { readInfraConfig } from "../../scripts/infra/config";
import { cleanupResources } from "../../scripts/testing/cleanup";
import type { OwnedResource } from "../../scripts/testing/types";
import { waitUntil } from "../fixtures/barrier";
import { docker } from "../fixtures/docker";

const certificateDirectory = resolve("infra/certs");
const traefikImage =
  "traefik:v3.5.4@sha256:4df0a50fcf71b454c0d7ad17675776dc8d37359deae3291895bdaa008c1b9972";
test("actual Traefik→BFF isolates A quota from B, strips forged ingress and native peer rejects spoof", async () => {
  const runId = `insta-priv01-${crypto.randomUUID()}`;
  const config = readInfraConfig();
  const backend = `${runId}-api`;
  const frontend = `${runId}-web`;
  const proxy = `${runId}-proxy`;
  const resources: OwnedResource[] = [];
  const own = async (args: string[]) => {
    const id = await docker(...args);
    resources.push({ kind: "container", id });
    return id;
  };
  const composeRun = (...args: string[]) => [
    "compose",
    "--project-name",
    config.project,
    "run",
    "-d",
    "--no-deps",
    ...args,
  ];
  const ownership = (name: string) => [
    "--name",
    name,
    "--label",
    `insta.testRunId=${runId}`,
  ];
  try {
    const network = await docker(
      "network",
      "create",
      "--label",
      `insta.testRunId=${runId}`,
      runId,
    );
    resources.push({ kind: "network", id: network });
    await own(
      composeRun(
        ...ownership(backend),
        "testhost",
        "bun",
        "--cwd",
        "apps/be-insta",
        "__tests__/privacy/host.ts",
      ),
    );
    await docker("network", "connect", runId, backend);
    const webId = await own(
      composeRun(
        ...ownership(frontend),
        "-p",
        "127.0.0.1::3000",
        "--env",
        `API_BASE_URL=http://${backend}:3001`,
        "--env",
        `TRUSTED_WEB_PROXY_HOST=${proxy}`,
        "fe-insta",
      ),
    );
    await docker("network", "connect", runId, frontend);
    const webPort = (await docker("port", webId, "3000/tcp")).split(":").at(-1);
    await waitUntil({
      check: async () =>
        fetch(`http://127.0.0.1:${webPort}/api/health/ready`).then(
          async (response) => {
            await response.body?.cancel();
            return response.ok;
          },
          () => false,
        ),
    });
    const directory = resolve(".infra/priv01-source", runId);
    await secureDirectory(directory);
    const dynamic = `${directory}/dynamic.yml`;
    await writePrivateFile({
      path: dynamic,
      content: `http:\n  routers:\n    web:\n      rule: PathPrefix(\u0060/\u0060)\n      entryPoints: [probe]\n      tls: {}\n      service: web\n  services:\n    web:\n      loadBalancer:\n        servers:\n          - url: http://${frontend}:3000\ntls:\n  certificates:\n    - certFile: /certs/localhost.crt\n      keyFile: /certs/localhost.key\n`,
    });
    await own([
      "run",
      "-d",
      ...ownership(proxy),
      "--network",
      runId,
      "-v",
      `${dynamic}:/source.yml:ro`,
      "-v",
      `${certificateDirectory}:/certs:ro`,
      traefikImage,
      "--entrypoints.probe.address=:8443",
      "--providers.file.filename=/source.yml",
      "--log.level=ERROR",
    ]);
    const clients = await Promise.all(
      ["a", "b"].map((name) =>
        own([
          "run",
          "-d",
          ...ownership(`${runId}-${name}`),
          "--network",
          runId,
          `${config.project}-testhost`,
          "bun",
          "-e",
          'Bun.serve({port:0,fetch:()=>new Response("isolated client")})',
        ]),
      ),
    );
    const request = async (
      client: string,
      target: string,
      headers: Record<string, string> = {},
    ) =>
      JSON.parse(
        await docker(
          "exec",
          client,
          "bun",
          "-e",
          'const [target,raw] = process.argv.slice(1); const response=await fetch(target,{tls:{rejectUnauthorized:false},method:"POST",headers:{"content-type":"application/json",origin:new URL(target).origin,...JSON.parse(raw)},body:JSON.stringify({choice:"necessary",policyVersion:1})}); await response.body?.cancel(); console.log(JSON.stringify({status:response.status}));',
          target,
          JSON.stringify(headers),
        ),
      ) as { status: number };
    const target = `https://${proxy}:8443/api/privacy/consent`;
    await waitUntil({
      check: async () =>
        docker(
          "exec",
          clients[0],
          "bun",
          "-e",
          "const response=await fetch(process.argv[1],{tls:{rejectUnauthorized:false}}); await response.body?.cancel(); console.log(JSON.stringify({ok:response.ok}));",
          target,
        ).then(
          (output) => JSON.parse(output).ok,
          () => false,
        ),
    });
    for (let count = 0; count < 10; count += 1) {
      expect((await request(clients[0], target)).status).toBe(200);
    }
    expect((await request(clients[0], target)).status).toBe(503);
    expect((await request(clients[1], target)).status).toBe(200);
    expect(
      (
        await request(clients[0], target, {
          "x-forwarded-for": "198.51.100.99",
          "x-insta-client-source": "b".repeat(64),
          "x-insta-source-issued-at": String(Date.now()),
          "x-insta-source-signature": "a".repeat(43),
        })
      ).status,
    ).toBe(503);
    const native = `http://${backend}:3001/v1/privacy/preferences`;
    expect(
      (
        await request(clients[0], native, {
          "x-forwarded-for": "198.51.100.99",
          "x-insta-client-source": "c".repeat(64),
        })
      ).status,
    ).toBe(429);
    expect((await request(clients[1], target)).status).toBe(200);
  } finally {
    await cleanupResources({ testRunId: runId, resources, execute: docker });
  }
}, 60000);
