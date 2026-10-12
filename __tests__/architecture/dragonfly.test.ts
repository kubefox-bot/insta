import { expect, test } from "bun:test";
import { runApiBoundariesCheck } from "@insta/fe-core/lints";
import config from "../../apps/fe-insta/api-boundaries.config.json";
import { repository } from "./fixtures/repository";

test("browser rejects Dragonfly public server export under production policy", async () => {
  using fixture = repository({
    "apps/fe-insta/src/routes/+page.svelte":
      '<script>import "@insta/fe-core/dragonfly/server";</script><p>fixture</p>',
  });
  const result = await runApiBoundariesCheck(
    {
      sourceRoot: config.sourceRoot,
      clientEntryFiles: ["apps/fe-insta/src/routes/+page.svelte"],
      generatedRoot: config.generatedRoot,
      serverApiRoots: ["apps/fe-insta/src/server"],
      transportFiles: [],
      transportPackageSpecifiers: config.transportPackageSpecifiers,
    },
    { cwd: fixture.path },
  );
  expect(result.findings.map((finding) => finding.rule)).toContain(
    "transport-boundary",
  );
});
