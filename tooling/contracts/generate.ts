import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "@kubb/core";
import { createKubbConfiguration } from "../../apps/fe-insta/kubb.config";
import { assertClosedWireObjects } from "./schema-policy";
export const generateContracts = async (root: string) => {
  const openapi = resolve(root, "packages/contracts/openapi.json");
  const output = resolve(root, "apps/fe-insta/src/lib/api/generated");
  await mkdir(resolve(root, "packages/contracts"), { recursive: true });
  const exporter = Bun.spawn([process.execPath, "src/app/openapi.ts"], {
    cwd: fileURLToPath(new URL("../../apps/be-insta", import.meta.url)),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, errors, exitCode] = await Promise.all([
    new Response(exporter.stdout).text(),
    new Response(exporter.stderr).text(),
    exporter.exited,
  ]);
  if (exitCode !== 0) throw new Error(`OpenAPI exporter failed: ${errors}`);
  assertClosedWireObjects(JSON.parse(out));
  const formatter = Bun.spawnSync(
    [
      process.execPath,
      fileURLToPath(new URL("../../node_modules/.bin/biome", import.meta.url)),
      "format",
      "--stdin-file-path",
      "packages/contracts/openapi.json",
    ],
    {
      cwd: fileURLToPath(new URL("../..", import.meta.url)),
      stdin: new TextEncoder().encode(out),
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  if (formatter.exitCode !== 0)
    throw new Error(`OpenAPI formatter failed: ${formatter.stderr.toString()}`);
  await Bun.write(openapi, formatter.stdout);
  const generated = await build({
    config: createKubbConfiguration({ openapi, output }),
  });
  if (generated.error || generated.failedPlugins.size)
    throw new Error(`Kubb generation failed: ${generated.error}`);
};
if (import.meta.main) await generateContracts(process.cwd());
