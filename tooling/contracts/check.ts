import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { generateContracts } from "./generate";

const collect = async (
  root: string,
  directory: string,
): Promise<Readonly<Record<string, string>>> => {
  const entries = await readdir(resolve(root, directory), {
    withFileTypes: true,
  });
  const result: Record<string, string> = {};
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) Object.assign(result, await collect(root, path));
    else result[path] = await readFile(resolve(root, path), "utf8");
  }
  return result;
};
export const checkContracts = async (root: string) => {
  const temp = await mkdtemp(join(tmpdir(), "insta-contracts-"));
  try {
    await generateContracts(temp);
    const generated: Readonly<Record<string, string>> = {
      ...(await collect(temp, "apps/fe-insta/src/lib/api/generated")),
      "packages/contracts/openapi.json": await readFile(
        join(temp, "packages/contracts/openapi.json"),
        "utf8",
      ),
    };
    const committed: Readonly<Record<string, string>> = {
      ...(await collect(root, "apps/fe-insta/src/lib/api/generated")),
      "packages/contracts/openapi.json": await readFile(
        join(root, "packages/contracts/openapi.json"),
        "utf8",
      ),
    };
    const paths = new Set([
      ...Object.keys(generated),
      ...Object.keys(committed),
    ]);
    const changed = [...paths].filter(
      (path) => generated[path] !== committed[path],
    );
    if (changed.length)
      throw new Error(`Generated contracts differ: ${changed.join(", ")}`);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
};
if (import.meta.main) await checkContracts(process.cwd());
