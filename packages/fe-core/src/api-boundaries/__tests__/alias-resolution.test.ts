import { expect, it } from "bun:test";
import { createFixtureRepository } from "../../../__tests__/fixture-repository.ts";
import { createCompleteProject, readRepositoryFiles } from "../project.ts";

const cases = [
  {
    name: "broad before specific",
    paths: { "*": ["src/safe.ts"], "@api/*": ["src/api/*"] },
    specifier: "@api/transport",
    target: "src/api/transport.ts",
  },
  {
    name: "specific before broad",
    paths: { "@api/*": ["src/api/*"], "*": ["src/safe.ts"] },
    specifier: "@api/transport",
    target: "src/api/transport.ts",
  },
  {
    name: "wildcard before exact",
    paths: {
      "@api/*": ["src/safe.ts"],
      "@api/transport": ["src/api/transport.ts"],
    },
    specifier: "@api/transport",
    target: "src/api/transport.ts",
  },
  {
    name: "exact before wildcard",
    paths: {
      "@api/transport": ["src/api/transport.ts"],
      "@api/*": ["src/safe.ts"],
    },
    specifier: "@api/transport",
    target: "src/api/transport.ts",
  },
  {
    name: "exact must not match prefix",
    paths: { "@api": ["src/safe.ts"] },
    specifier: "@api/transport",
    target: undefined,
  },
  {
    name: "missing specific target must not fall back",
    paths: { "*": ["src/safe.ts"], "@api/*": ["missing/*"] },
    specifier: "@api/transport",
    target: undefined,
  },
  {
    name: "fallback within selected alias",
    paths: { "*": ["src/safe.ts"], "@api/*": ["missing/*", "src/api/*"] },
    specifier: "@api/transport",
    target: "src/api/transport.ts",
  },
  {
    name: "wildcard suffix",
    paths: { "@api/*/public": ["src/api/*"] },
    specifier: "@api/transport/public",
    target: "src/api/transport.ts",
  },
] satisfies ReadonlyArray<{
  name: string;
  paths: Record<string, string[]>;
  specifier: string;
  target: string | undefined;
}>;

for (const scenario of cases) {
  it(`API graph resolves ${scenario.name}`, async () => {
    using fixture = createFixtureRepository({
      "tsconfig.json": JSON.stringify({
        compilerOptions: { paths: scenario.paths },
        include: ["src/**/*.ts"],
      }),
      "src/consumer.ts": `import { request } from "${scenario.specifier}"; void request;`,
      "src/safe.ts": "export const request = () => undefined;",
      "src/api/transport.ts": "export const request = () => fetch('/api');",
    });
    const project = await createCompleteProject(
      fixture.path,
      readRepositoryFiles(fixture.path),
    );
    try {
      expect(project.modules.get("src/consumer.ts")?.imports[0]?.target).toBe(
        scenario.target,
      );
    } finally {
      await project.compiler.close();
    }
  });
}
