import { expect, it } from "bun:test";
import {
  type ApiBoundaryConfig,
  runApiBoundariesCheck,
} from "@insta/fe-core/lints";
import { policyScaffold } from "./fixtures/frontend-policy";
import { receiptsScaffold } from "./fixtures/frontend-receipts";
import { storiesScaffold } from "./fixtures/frontend-stories";
import { telemetryScaffold } from "./fixtures/frontend-telemetry";
import { repository } from "./fixtures/repository.ts";

const config = {
  sourceRoot: "src",
  clientEntryFiles: ["src/routes/+page.svelte"],
  transportFiles: [],
  serverApiRoots: ["src/server"],
  generatedRoot: "src/generated",
  transportPackageSpecifiers: ["@insta/contracts/server"],
} satisfies ApiBoundaryConfig;
for (const script of ["<script>", "<script module>"]) {
  it(`tracks browser/server re-export chain from ${script}`, async () => {
    using fixture = repository({
      "src/routes/+page.svelte": `${script}import { secret } from "../bridge.ts";</script><p>fixture</p>`,
      "src/bridge.ts": 'export { secret } from "./server/secret.ts";',
      "src/server/secret.ts": 'export const secret = "synthetic-canary";',
    });
    expect(
      (await runApiBoundariesCheck(config, { cwd: fixture.path })).findings.map(
        (value) => value.rule,
      ),
    ).toContain("client-server-import");
  });
  it(`rejects direct fetch and server package in ${script}`, async () => {
    using fixture = repository({
      "src/routes/+page.svelte": `${script}import "@insta/contracts/server"; fetch("/api");</script><p>fixture</p>`,
    });
    const rules = (
      await runApiBoundariesCheck(config, { cwd: fixture.path })
    ).findings.map((value) => value.rule);
    expect(rules).toContain("direct-fetch");
    expect(rules).toContain("transport-boundary");
  });
}
it("automatically enrolls a future Svelte component as browser entry", async () => {
  using fixture = repository({
    "src/routes/+page.svelte": "<p>fixture</p>",
    "src/components/Player/index.svelte":
      '<script>import "../..//server/secret.ts";</script><p>fixture</p>',
    "src/server/secret.ts": "export const secret = 1;",
  });
  expect(
    (await runApiBoundariesCheck(config, { cwd: fixture.path })).findings.map(
      (value) => value.rule,
    ),
  ).toContain("client-server-import");
});
it("permits a pure browser component with future protected directories absent", async () => {
  using fixture = repository({ "src/routes/+page.svelte": "<p>fixture</p>" });
  expect(
    (await runApiBoundariesCheck(config, { cwd: fixture.path })).findings,
  ).toEqual([]);
});

it("does not grant Next server-action exemption to Svelte browser imports", async () => {
  using fixture = repository({
    "src/routes/+page.svelte":
      '<script>import { secret } from "../server/action.ts";</script><p>fixture</p>',
    "src/server/action.ts":
      '"use server"; export const secret = async () => "synthetic-canary";',
  });
  expect(
    (await runApiBoundariesCheck(config, { cwd: fixture.path })).findings.map(
      (value) => value.rule,
    ),
  ).toContain("client-server-import");
});

it("actual frontend config enrolls approved future server owners and generated SDK", async () => {
  const configuration = await Bun.file(
    new URL("../../apps/fe-insta/api-boundaries.config.json", import.meta.url),
  ).json();
  for (const target of [
    "domains/users/server/read.ts",
    "domains/privacy/server/load.ts",
    "domains/conversations/server/read.ts",
    "domains/conversations/server/receipts/adapters/backend.ts",
    "domains/support-reports/server/read.ts",
    "lib/api/server/read.ts",
    "lib/session/server/index.ts",
    "lib/session/server/cookies.ts",
    "lib/api/generated/sdk.ts",
    "lib/config/server/read.ts",
    "lib/database/server/connect.ts",
    "app/infrastructure/server/health.ts",
    "app/observability/server/runtime.ts",
    "app/continuation/server/create.ts",
    "app/support-reports/server/create.ts",
    "app/conversations/server/create.ts",
    "app/lifecycle/server/shutdown.ts",
    "routes/+layout.server.ts",
    "app/observability/server/preload.ts",
    "lib/observability/server/runtime.server.ts",
  ]) {
    using fixture = repository({
      ...telemetryScaffold,
      ...receiptsScaffold,
      ...storiesScaffold,
      ...policyScaffold,
      "apps/fe-insta/src/app/stories/server/create.ts": "export {};",
      "apps/fe-insta/src/domains/stories/server/adapters/backend.ts":
        "export {};",
      "apps/fe-insta/src/shared/components/LocaleControls/index.svelte":
        "<p>locale fixture</p>",
      "apps/fe-insta/src/routes/+page.svelte": `<script>import "../${target}";</script><p>fixture</p>`,
      "apps/fe-insta/src/routes/+layout.svelte": "<p>fixture</p>",
      "apps/fe-insta/src/routes/auth/+page.svelte": "<p>fixture</p>",
      [`apps/fe-insta/src/${target}`]: "export const value = 1;",
      "apps/fe-insta/src/hooks.server.ts": "export const handle=()=>null;",
      "apps/fe-insta/src/routes/conversations/+layout.svelte": "<p>fixture</p>",
      "apps/fe-insta/src/routes/conversations/+page.svelte": "<p>fixture</p>",
      "apps/fe-insta/src/routes/continue/+page.svelte": "<p>fixture</p>",
      "apps/fe-insta/src/routes/stories/new/+page.svelte": "<p>fixture</p>",
      "apps/fe-insta/src/routes/conversations/[id]/+page.svelte":
        "<p>fixture</p>",
      "apps/fe-insta/src/routes/conversations/+layout.server.ts": "export {};",
      "apps/fe-insta/src/routes/conversations/[id]/+page.server.ts":
        "export {};",
      "apps/fe-insta/src/domains/conversations/browser/transport.ts":
        "export {};",
      "apps/fe-insta/src/domains/users/browser/directory/transport.ts":
        "export {};",
      "apps/fe-insta/src/app/observability/server/preload.ts":
        "export const read=()=>null;",
      "apps/fe-insta/src/app/observability/server/runtime.ts":
        "export const read=()=>null;",
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
      "apps/fe-insta/src/app/privacy/server/create.ts":
        "export const request=()=>null;",
      "apps/fe-insta/src/domains/privacy/browser/transport.ts":
        "export const request=()=>null;",
      "apps/fe-insta/src/app/infrastructure/server/health.ts":
        "export const checkReadiness=()=>false;",
      "apps/fe-insta/src/lib/api/server/api-service.ts":
        "export const request=()=>null;",
      "apps/fe-insta/src/lib/api/server/transport.server.ts":
        "export const transport=()=>null;",
    });
    expect(
      (
        await runApiBoundariesCheck(configuration, { cwd: fixture.path })
      ).findings.map((value) => value.rule),
    ).toContain("client-server-import");
  }
});

for (const moduleScript of [
  'import axios from "axios";',
  'import * as axios from "axios";',
]) {
  it(`rejects cross-script HTTP access: ${moduleScript}`, async () => {
    using fixture = repository({
      "src/routes/+page.svelte": `<script module>${moduleScript}</script><script>axios.get("/api");</script><p>fixture</p>`,
    });
    expect(
      (await runApiBoundariesCheck(config, { cwd: fixture.path })).findings.map(
        (value) => value.rule,
      ),
    ).toContain("direct-fetch");
  });
}
for (const instanceScript of [
  'const axios = { get: () => "local" }; axios.get("/api");',
  'const invoke = (axios: { get: (path: string) => string }) => axios.get("/api");',
]) {
  it(`accepts instance shadowing of module HTTP import: ${instanceScript}`, async () => {
    using fixture = repository({
      "src/routes/+page.svelte": `<script module lang="ts">import axios from "axios";</script><script lang="ts">${instanceScript}</script><p>fixture</p>`,
    });
    expect(
      (await runApiBoundariesCheck(config, { cwd: fixture.path })).findings,
    ).toEqual([]);
  });
}
it("preserves module-local fetch shadowing of the ambient global in instance", async () => {
  using fixture = repository({
    "src/routes/+page.svelte":
      '<script module>const fetch = () => "local";</script><script>fetch();</script><p>fixture</p>',
  });
  expect(
    (await runApiBoundariesCheck(config, { cwd: fixture.path })).findings,
  ).toEqual([]);
});

it("ignores module type-only names when resolving ambient global fetch", async () => {
  using fixture = repository({
    "src/routes/+page.svelte":
      '<script module lang="ts">type fetch = string;</script><script>fetch("/api");</script><p>fixture</p>',
  });
  expect(
    (await runApiBoundariesCheck(config, { cwd: fixture.path })).findings.map(
      (value) => value.rule,
    ),
  ).toContain("direct-fetch");
});

it("keeps module bindings from another component out of browser fetch resolution", async () => {
  using fixture = repository({
    "src/routes/+page.svelte": '<script>fetch("/api");</script><p>fixture</p>',
    "src/components/Local/index.svelte":
      '<script module>const fetch = () => "local";</script><p>local</p>',
  });
  expect(
    (await runApiBoundariesCheck(config, { cwd: fixture.path })).findings.map(
      (value) => value.rule,
    ),
  ).toContain("direct-fetch");
});
it("allows only registered public browser transport and keeps backend SDK protected", async () => {
  using fixture = repository({
    "src/routes/+page.svelte":
      '<script>import {read} from "../browser/index.ts";</script>',
    "src/browser/index.ts": 'export {read} from "./transport.ts";',
    "src/browser/transport.ts":
      'export const read = () => fetch("/api/privacy/consent");',
    "src/server/sdk.ts": 'export const secret = "backend";',
    "src/unlisted.ts": 'fetch("/api/unlisted");',
  });
  const browserConfig = {
    ...config,
    browserTransportFiles: ["src/browser/transport.ts"],
  };
  const findings = (
    await runApiBoundariesCheck(browserConfig, { cwd: fixture.path })
  ).findings;
  expect(findings).toEqual([
    expect.objectContaining({ path: "src/unlisted.ts", rule: "direct-fetch" }),
  ]);
  await Bun.write(
    `${fixture.path}/src/browser/transport.ts`,
    'import "../server/sdk.ts"; export const read = () => fetch("/api/privacy/consent");',
  );
  expect(
    (
      await runApiBoundariesCheck(browserConfig, { cwd: fixture.path })
    ).findings.map((entry) => entry.rule),
  ).toContain("client-server-import");
});
it("rejects registered browser transport inside protected server roots", async () => {
  using fixture = repository({
    "src/routes/+page.svelte": "<p>fixture</p>",
    "src/server/transport.ts": 'fetch("/api");',
  });
  await expect(
    runApiBoundariesCheck(
      { ...config, browserTransportFiles: ["src/server/transport.ts"] },
      { cwd: fixture.path },
    ),
  ).rejects.toThrow("browserTransportFiles");
});
