import { expect, test } from "bun:test";
import { existsSync, statSync } from "node:fs";

type Stage = Readonly<{
  parent: string;
  instructions: readonly string[];
}>;

const readStages = (source: string): ReadonlyMap<string, Stage> => {
  const stages = new Map<string, Stage>();
  for (const block of source.split(/^FROM /m).slice(1)) {
    const [header = "", ...instructions] = block.trim().split("\n");
    const [parent = "", , name = ""] = header.split(/\s+/);
    if (!name) throw new Error(`Named Docker stage required: ${header}`);
    stages.set(name, { parent, instructions });
  }
  return stages;
};

const dependencyInstructions = ({
  stages,
  target,
}: Readonly<{
  stages: ReadonlyMap<string, Stage>;
  target: string;
}>): readonly string[] => {
  const visited = new Set<string>();
  const instructions: string[] = [];
  const visit = (name: string): void => {
    if (visited.has(name)) return;
    const stage = stages.get(name);
    if (!stage) throw new Error(`Unknown Docker stage: ${name}`);
    visited.add(name);
    const copiedStages = stage.instructions
      .map((instruction) => instruction.match(/^COPY --from=(\S+)/)?.[1])
      .filter((name): name is string => name !== undefined);
    for (const dependency of [stage.parent, ...copiedStages])
      if (stages.has(dependency)) visit(dependency);
    instructions.push(...stage.instructions);
  };
  visit(target);
  return instructions;
};

const runtimeInstructions = ({
  stages,
  target,
}: Readonly<{
  stages: ReadonlyMap<string, Stage>;
  target: string;
}>): readonly string[] => {
  const stage = stages.get(target);
  if (!stage) throw new Error(`Unknown Docker stage: ${target}`);
  const inherited = stages.has(stage.parent)
    ? runtimeInstructions({ stages, target: stage.parent })
    : [];
  return [...inherited, ...stage.instructions];
};

test("Docker target graph follows inheritance and copied stages without unrelated earlier stages", () => {
  const stages = readStages(`FROM bun AS install
RUN install
FROM install AS foreign
RUN foreign-build
FROM install AS own
RUN own-build
FROM bun AS runtime
COPY --from=own /dist /dist
FROM runtime AS app
RUN ready`);
  expect(dependencyInstructions({ stages, target: "app" })).toEqual([
    "RUN install",
    "RUN own-build",
    "COPY --from=own /dist /dist",
    "RUN ready",
  ]);
});

for (const app of ["frontend", "backend"] as const) {
  test(`${app} target builds only its own app and never enrolls the test renderer or foreign source`, async () => {
    const stages = readStages(await Bun.file("Dockerfile").text());
    const instructions = dependencyInstructions({ stages, target: app });
    const owner = app === "frontend" ? "fe-insta" : "be-insta";
    const foreign = app === "frontend" ? "be-insta" : "fe-insta";
    const builds = instructions.filter((line) =>
      /^RUN .*\b(build:apps|build|renderer\/build\.ts)\b/.test(line),
    );
    expect(builds).toEqual([`RUN bun run --cwd apps/${owner} build`]);
    const hostCopies = instructions.filter(
      (line) => line.startsWith("COPY ") && !line.includes("--from="),
    );
    expect(hostCopies).not.toContain("COPY . .");
    expect(
      hostCopies.filter(
        (line) =>
          line.includes(`apps/${foreign}`) && !line.includes("package.json"),
      ),
    ).toEqual([]);
    expect(hostCopies.some((line) => line.includes("__tests__/"))).toBe(false);
  });

  test(`${app} runtime copies scoped artifacts without repository, tests or foreign application source`, async () => {
    const stages = readStages(await Bun.file("Dockerfile").text());
    const instructions = runtimeInstructions({ stages, target: app });
    const foreign = app === "frontend" ? "be-insta" : "fe-insta";
    const sources = instructions
      .filter((line) => line.startsWith("COPY "))
      .map((line) => line.replace(/^COPY(?: --from=\S+)? /, "").split(" ")[0]);
    const copiedFiles = sources.flatMap((source) => {
      if (!source) return [];
      const local = source.replace(/^\/workspace\//, "");
      if (local.includes("node_modules") || local.includes("/dist")) return [];
      const pattern =
        existsSync(local) && statSync(local).isDirectory()
          ? `${local}/**/*`
          : local;
      return [...new Bun.Glob(pattern).scanSync({ onlyFiles: true })];
    });
    for (const entrypoint of [
      "packages/fe-core/src/dates/index.ts",
      "packages/fe-core/src/dragonfly/server/index.ts",
      "packages/fe-core/src/lifecycle/server/index.ts",
      "packages/fe-core/src/observability/server/index.ts",
    ])
      expect(copiedFiles).toContain(entrypoint);
    expect(
      copiedFiles.filter((path) =>
        /(?:^|\/)__tests__(?:\/|$)|\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path),
      ),
    ).toEqual([]);
    expect(sources).not.toContain(".");
    expect(sources).not.toContain("/workspace");
    expect(sources.some((source) => source?.includes("__tests__"))).toBe(false);
    expect(sources.some((source) => source?.includes(`apps/${foreign}`))).toBe(
      false,
    );
  });
}

test("testhost preserves both app builds, renderer and source-capable dependencies", async () => {
  const stages = readStages(await Bun.file("Dockerfile").text());
  const instructions = dependencyInstructions({ stages, target: "testhost" });
  expect(instructions).toContain("RUN bun run --cwd apps/fe-insta build");
  expect(instructions).toContain("RUN bun run --cwd apps/be-insta build");
  expect(instructions).toContain(
    "RUN bun __tests__/unit/stories/renderer/build.ts",
  );
  expect(instructions).toContain("COPY . .");
  expect(dependencyInstructions({ stages, target: "dependencies" })).toContain(
    "COPY . .",
  );
});

test("combined testhost prepares generated Kit tsconfig before the standalone renderer", async () => {
  const stages = readStages(await Bun.file("Dockerfile").text());
  const instructions = stages.get("build")?.instructions ?? [];
  const sync = instructions.indexOf(
    "RUN cd apps/fe-insta && bun --bun svelte-kit sync",
  );
  const renderer = instructions.indexOf(
    "RUN bun __tests__/unit/stories/renderer/build.ts",
  );
  expect(sync).toBeGreaterThanOrEqual(0);
  expect(renderer).toBeGreaterThan(sync);
  for (const target of ["frontend", "backend"])
    expect(dependencyInstructions({ stages, target })).not.toContain(
      "RUN cd apps/fe-insta && bun --bun svelte-kit sync",
    );
});
