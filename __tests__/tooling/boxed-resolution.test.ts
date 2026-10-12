import { expect, test } from "bun:test";
import { createRequire } from "node:module";
import { z } from "zod";

const manifestSchema = z.object({
  dependencies: z.record(z.string(), z.string()).optional(),
  devDependencies: z.record(z.string(), z.string()).optional(),
});
const librarySchema = z.object({
  name: z.literal("@bloodyowl/boxed"),
  version: z.string(),
});
const rootManifest = new URL("../../package.json", import.meta.url);
const root = manifestSchema.parse(await Bun.file(rootManifest).json());
const canonicalVersion = z
  .string()
  .parse(root.devDependencies?.["@bloodyowl/boxed"]);

test.each([
  "package.json",
  "packages/fe-core/package.json",
  "apps/fe-insta/package.json",
  "apps/be-insta/package.json",
])(
  "canonical Boxed types require the same declared and installed library: %s",
  async (path) => {
    const manifestUrl = new URL(`../../${path}`, import.meta.url);
    const manifest = manifestSchema.parse(await Bun.file(manifestUrl).json());
    const declared =
      manifest.dependencies?.["@bloodyowl/boxed"] ??
      manifest.devDependencies?.["@bloodyowl/boxed"];
    const require = createRequire(manifestUrl);
    const installed = librarySchema.parse(
      await Bun.file(require.resolve("@bloodyowl/boxed/package.json")).json(),
    );
    expect(canonicalVersion).toBeDefined();
    expect(declared).toBe(canonicalVersion);
    expect(installed.version).toBe(canonicalVersion);
  },
);

test("only the root compiler canonicalizes Boxed through its public package", async () => {
  const configSchema = z.object({
    compilerOptions: z.object({
      paths: z.record(z.string(), z.array(z.string())).optional(),
    }),
  });
  const config = configSchema.parse(
    await Bun.file(new URL("../../tsconfig.json", import.meta.url)).json(),
  );
  expect(config.compilerOptions.paths?.["@bloodyowl/boxed"]).toEqual([
    "./node_modules/@bloodyowl/boxed",
  ]);
  for (const owner of ["fe-insta", "be-insta"]) {
    const app = configSchema.parse(
      await Bun.file(
        new URL(`../../apps/${owner}/tsconfig.json`, import.meta.url),
      ).json(),
    );
    expect(app.compilerOptions.paths?.["@bloodyowl/boxed"]).toBeUndefined();
  }
});
