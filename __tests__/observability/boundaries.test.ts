import { expect, test } from "bun:test";
import {
  type ApiBoundaryConfig,
  runApiBoundariesCheck,
} from "@insta/fe-core/lints";
import { policyScaffold } from "../architecture/fixtures/frontend-policy";
import { receiptsScaffold } from "../architecture/fixtures/frontend-receipts";
import { storiesScaffold } from "../architecture/fixtures/frontend-stories";
import { telemetryScaffold } from "../architecture/fixtures/frontend-telemetry";
import { repository } from "../architecture/fixtures/repository";

const config: ApiBoundaryConfig = await Bun.file(
  new URL("../../apps/fe-insta/api-boundaries.config.json", import.meta.url),
).json();
const scaffold = {
  ...telemetryScaffold,
  ...receiptsScaffold,
  ...storiesScaffold,
  ...policyScaffold,
  "apps/fe-insta/src/app/stories/server/create.ts": "export {};",
  "apps/fe-insta/src/domains/stories/server/adapters/backend.ts": "export {};",
  "apps/fe-insta/src/shared/components/LocaleControls/index.svelte":
    "<p>locale fixture</p>",
  "apps/fe-insta/src/routes/conversations/+layout.svelte": "<p>fixture</p>",
  "apps/fe-insta/src/routes/conversations/+page.svelte": "<p>fixture</p>",
  "apps/fe-insta/src/routes/continue/+page.svelte": "<p>fixture</p>",
  "apps/fe-insta/src/routes/stories/new/+page.svelte": "<p>fixture</p>",
  "apps/fe-insta/src/routes/conversations/[id]/+page.svelte": "<p>fixture</p>",
  "apps/fe-insta/src/routes/conversations/+layout.server.ts": "export {};",
  "apps/fe-insta/src/routes/conversations/[id]/+page.server.ts": "export {};",
  "apps/fe-insta/src/domains/conversations/browser/transport.ts": "export {};",
  "apps/fe-insta/src/domains/users/browser/directory/transport.ts":
    "export {};",
  "apps/fe-insta/src/routes/+page.svelte": "<p>fixture</p>",
  "apps/fe-insta/src/routes/+layout.svelte": "<p>fixture</p>",
  "apps/fe-insta/src/routes/auth/+page.svelte": "<p>fixture</p>",
  "apps/fe-insta/src/hooks.server.ts": "export {};",
  "apps/fe-insta/src/app/users/server/create.ts": "export {};",
  "apps/fe-insta/src/app/infrastructure/server/database/create.ts":
    "export {};",
  "apps/fe-insta/src/app/users/server/session/create.ts": "export {};",
  "apps/fe-insta/src/app/continuation/server/create.ts": "export {};",
  "apps/fe-insta/src/app/support-reports/server/create.ts": "export {};",
  "apps/fe-insta/src/app/conversations/server/create.ts": "export {};",
  "apps/fe-insta/src/domains/conversations/browser/outbox/adapters/sender.ts":
    "export {};",
  "apps/fe-insta/src/routes/+layout.server.ts": "export {};",
  "apps/fe-insta/src/routes/+page.server.ts": "export {};",
  "apps/fe-insta/src/routes/auth/+page.server.ts": "export {};",
  "apps/fe-insta/src/domains/users/browser/transport.ts": "export {};",
  "apps/fe-insta/src/domains/users/browser/ws-ticket.ts": "export {};",
  "apps/fe-insta/src/domains/users/browser/auth-flow.ts": "export {};",
  "apps/fe-insta/src/domains/support-reports/browser/adapters/http/submit.ts":
    "export {};",
  "apps/fe-insta/src/domains/auth-continuation/browser/transport.ts":
    "export {};",
  "apps/fe-insta/src/app/http/server/prepare.ts": "export {};",
  "apps/fe-insta/src/app/privacy/server/create.ts": "export {};",
  "apps/fe-insta/src/domains/privacy/browser/transport.ts": "export {};",
  "apps/fe-insta/src/app/infrastructure/server/health.ts": "export {};",
  "apps/fe-insta/src/app/observability/server/preload.ts": "export {};",
  "apps/fe-insta/src/app/observability/server/runtime.ts": "export {};",
  "apps/fe-insta/src/lib/api/server/transport.server.ts": "export {};",
  "apps/fe-insta/src/lib/api/server/api-service.ts": "export {};",
};
for (const source of [
  "src/lib/browser.ts",
  "src/routes/+page.svelte",
] as const) {
  test(`actual frontend config denies bare portable server import in ${source}`, async () => {
    const code =
      'import { readContext } from "@insta/fe-core/observability/server"; export const read = () => readContext();';
    using fixture = repository({
      ...scaffold,
      [`apps/fe-insta/${source}`]: source.endsWith(".svelte")
        ? `<script>${code}</script><p>fixture</p>`
        : code,
    });
    const result = await runApiBoundariesCheck(config, { cwd: fixture.path });
    expect(result.findings.map((finding) => finding.rule)).toContain(
      "transport-boundary",
    );
  });
}
test("actual frontend config accepts portable browser and owned logging bridge", async () => {
  using fixture = repository({
    ...scaffold,
    "apps/fe-insta/src/lib/browser.ts":
      'export { createObservabilityService } from "@insta/fe-core/observability/browser";',
    "apps/fe-insta/src/lib/observability/server/runtime.server.ts":
      'import { readContext } from "@insta/fe-core/observability/server"; export const read = () => readContext();',
  });
  expect(
    (await runApiBoundariesCheck(config, { cwd: fixture.path })).findings,
  ).toEqual([]);
});
test("DONE-01 actual telemetry browser and same-origin server adapters are enrolled positively", async () => {
  using fixture = repository({
    ...scaffold,
    "apps/fe-insta/src/lib/observability/browser/faro.ts":
      'export const probe = () => fetch("/api/telemetry/faro");',
    "apps/fe-insta/src/lib/observability/browser/transport.ts":
      'export const send = () => fetch("/api/telemetry", { method: "POST" });',
    "apps/fe-insta/src/lib/observability/server/publish-faro.ts":
      'export const publish = () => fetch("http://telemetry-receiver/collect");',
    "apps/fe-insta/src/routes/+page.svelte":
      '<script>import {probe} from "../lib/observability/browser/faro";</script><p>{typeof probe}</p>',
  });
  expect(
    (await runApiBoundariesCheck(config, { cwd: fixture.path })).findings,
  ).toEqual([]);
});
test("DONE-01 HTTP intake owner remains an enrolled server capability without a new config exception", async () => {
  using fixture = repository({
    ...scaffold,
    "apps/fe-insta/src/lib/observability/server/http-intake.ts":
      "export const createHttpIntake=()=>()=>new Response();",
    "apps/fe-insta/src/lib/observability/server/index.ts":
      'export {createHttpIntake} from "./http-intake";',
    "apps/fe-insta/src/app/observability/server/intake/receive.ts":
      'import {createHttpIntake} from "../../../../lib/observability/server/index"; export const receiveTelemetry=createHttpIntake();',
    "apps/fe-insta/src/app/http/server/limits/inspect.ts":
      'import {inspectRequestLimits} from "../../../../lib/http/server/index";export const inspectRequestForRoute=inspectRequestLimits;',
  });
  expect(
    (await runApiBoundariesCheck(config, { cwd: fixture.path })).findings,
  ).toEqual([]);
});
for (const target of [
  "app/observability/server/intake/receive.ts",
  "app/http/server/limits/inspect.ts",
  "lib/observability/server/faro.ts",
  "lib/observability/server/http-intake.ts",
  "lib/config/server/telemetry.ts",
]) {
  test(`DONE-01 new telemetry owner ${target} cannot enter Svelte browser`, async () => {
    using fixture = repository({
      ...scaffold,
      [`apps/fe-insta/src/${target}`]: "export const secret=1;",
      "apps/fe-insta/src/routes/+page.svelte": `<script>import "../${target}";</script><p>fixture</p>`,
    });
    expect(
      (await runApiBoundariesCheck(config, { cwd: fixture.path })).findings.map(
        (value) => value.rule,
      ),
    ).toContain("client-server-import");
  });
}
test("DONE-01 copied config detects removed browser transport enrollment rather than exempting future files", async () => {
  const path = "apps/fe-insta/src/lib/observability/browser/faro.ts";
  using fixture = repository({
    ...scaffold,
    [path]: 'export const probe = () => fetch("/api/telemetry/faro");',
  });
  const drifted = {
    ...config,
    browserTransportFiles: config.browserTransportFiles?.filter(
      (value) => value !== path,
    ),
  };
  expect(
    (await runApiBoundariesCheck(drifted, { cwd: fixture.path })).findings.map(
      (value) => value.rule,
    ),
  ).toContain("direct-fetch");
});

for (const enrolled of [true, false]) {
  test(`actual frontend config ${enrolled ? "accepts owned" : "rejects unenrolled"} locale form transport`, async () => {
    const path = "apps/fe-insta/src/lib/i18n/browser/transport.ts";
    using fixture = repository({
      ...scaffold,
      [path]: 'export const change=()=>fetch("/locale",{method:"POST"});',
    });
    const selected = enrolled
      ? config
      : {
          ...config,
          browserTransportFiles: config.browserTransportFiles?.filter(
            (file) => file !== path,
          ),
        };
    expect(
      (
        await runApiBoundariesCheck(selected, { cwd: fixture.path })
      ).findings.map((finding) => finding.rule),
    ).toEqual(enrolled ? [] : ["direct-fetch"]);
  });
}

for (const enrolled of [true, false]) {
  test(`actual frontend config ${enrolled ? "accepts owned" : "rejects unenrolled"} Stories public HTTP transport`, async () => {
    const path =
      "apps/fe-insta/src/domains/stories/browser/adapters/http/create.ts";
    using fixture = repository({
      ...scaffold,
      [path]: 'export const read=()=>fetch("/api/stories");',
      "apps/fe-insta/src/routes/+page.svelte":
        '<script>import {read} from "../domains/stories/browser/adapters/http/create";</script><p>{typeof read}</p>',
    });
    const selected = enrolled
      ? config
      : {
          ...config,
          browserTransportFiles: config.browserTransportFiles?.filter(
            (file) => file !== path,
          ),
        };
    expect(
      (
        await runApiBoundariesCheck(selected, { cwd: fixture.path })
      ).findings.map((finding) => finding.rule),
    ).toEqual(enrolled ? [] : ["direct-fetch"]);
  });
}
