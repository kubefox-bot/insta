# Insta workspace agreements

Follow the user's global coding agreements and the current architecture and
capability documentation. Keep conversation and human-facing documentation in
Russian, and AGENTS.md instructions in English.

## Scope

On 2026-10-08 the user explicitly authorized local implementation of the approved
plan, dependency installation, local test infrastructure and meaningful commits
after completed task scopes. Preserve existing work. Complete the primary auth,
directory and conversations application, including its acceptance checks, first.
Optional stories require a separate explicit user command after the core handoff;
core completion, independent reviews and existing implementation authorization
do not authorize stories automatically. Defer media-recorder, media/storage
adapters, RustFS setup and story-specific tests until that command. Shared
contracts and technical extension points may be prepared without implementing
or exposing the deferred feature.
A separate explicit Stories command was subsequently authorized on 2026-10-10.
STORY-01 through STORY-08 now have implemented media/storage and Full runner
owners; this authorization does not make future optional features implicit.
Record current source/runtime verification and remaining manual/compatibility
gaps in docs/testing.md and docs/browser-compatibility.md.
Core remains independently selectable with Stories disabled.
Use independent reviewers when requested or when task risk warrants them. Put
new tests in __tests__/ folders, organized by capability or test phase; retain
existing upstream tests. Record actual progress and checks; do not claim
unfinished phases.
This authorization does not include push, publication, deployment, changes to
system certificate trust or destructive removal of developer data.

AGENTS.md defines agent working agreements, not a new product API. The user kept
REST between BFF and Nest; do not introduce gRPC or another transport implicitly.

## Ownership

- `packages/fe-core` owns portable lint tooling and shared configuration.
- `apps/fe-insta` owns SvelteKit routes, BFF and frontend domains.
- `apps/be-insta` owns Nest composition and backend domains.
- Dependencies flow from applications to shared packages, never the reverse.
- Consume package public subpaths; do not deep-import private implementation.
- Keep provider/framework configuration out of pure domain decisions.
- Keep environment access at a validated configuration owner.
- Auth continuation owns expiring Dragonfly intents with a protected browser
  context and per-intent selection. Do not store message text or video blobs in
  that store; preserve explicit confirmation after authentication.
- Privacy owns cookie preference and optional-telemetry permission. Necessary
  mode must preserve application behavior and minimal operational server logs;
  Faro, client metrics and analytics goals require current explicit consent.

## Capability and composition boundaries

- Target an extractable modular monolith. Here app means the technical
  composition root, not the whole apps/ workspace containing domain code.
  Composition constructs infrastructure clients, injects validated config,
  connects ports/adapters, registers transport handlers and owns lifecycle.
  It must not own business workflows, authorization policy, compensation rules
  or a global business-command bus. Guards delegate to the owning auth capability.
- Business orchestration belongs to a focused use case in its owning capability.
  Assign an explicit owner to a cross-capability scenario; do not place it in
  bootstrap, route composition or a generic workflows/services collection.
  Supply narrow consumer-owned ports and connect public implementations at the
  composition root. Connect callback/handler references without hiding business
  sequencing in configuration. Auth continuation retains its own scenario owner.
- Modules must not depend on the host app, its routes, another module's private
  state or global mutable stores. Package extraction should preserve business
  use cases and behavioral tests, changing integration/imports and environment
  adapters. Frontend modules own their styles and resource/subscription cleanup.
  Independent microfrontend loading, deployment and runtime federation are not
  part of this scope; package extraction alone does not prove those capabilities.
- A capability owns its rules, use cases, contracts and adapters. Messages belong
  to conversations; authentication and directory belong to users. Support reports
  own their persistence and email policy. Do not create another domain solely for
  a transport, event envelope or empty folder symmetry.
- Keep pure rules under the owning `domain/`; orchestration in focused
  `use-cases/`; consumer-owned external contracts in `ports/`; implementations in
  `adapters/`. Create only folders with actual responsibilities. Nest composition
  belongs in `src/app/`; SvelteKit route files are composition/transport boundaries.
- Use cases depend on their domain and ports, never concrete Mongo, Dragonfly,
  SMTP, S3, HTTP clients, framework DI or raw environment access. Adapters depend
  inward; composition constructs and connects them. A transaction port expresses
  the required atomic business operation without leaking a Mongo session.
- Cross-domain calls use public capability APIs and explicit dependencies. Never
  read another domain's collections or private modules. Shared packages and
  generic app `lib/` must not import consuming domains. Assemble domain-specific
  HTTP/WS handlers and registries at composition, not inside generic telemetry.
- Frontend UI consumes its capability's view state and public operations. Split
  browser and server entrypoints; tokens, generated backend SDK and server config
  must not enter browser bundles. BFF owns web sessions and transport adaptation;
  Nest owns authorization, business policy and canonical persistence.
- Backend-owned HTTP DTOs generate OpenAPI and Kubb outputs. `packages/contracts`
  must not import backend implementation. Generated wire types do not replace
  distinct domain contracts; map once at the responsible boundary where needed.
- Expose narrow named public exports. Internal imports are direct, external
  imports use public entrypoints. Avoid universal repositories/services, implicit
  service locators and `utils` collections. Add a facade only when it has meaning.

## Declarative implementation and review

### Folder ownership and frontend contracts

- Prefer a purpose-named folder for a component or cohesive capability over a
  flat stream of sibling implementation files. Co-locate its contracts, styles,
  tests and supporting operations. Do not create a folder for every trivial
  expression or move unrelated helpers into a catch-all module.
- A stateful/styled component lives under components/ComponentName/ with its
  index.svelte, props.ts and styles.module.css as needed. Owner-local
  types.ts holds state/result types and conts.ts holds static values/mappings.
  Do not create empty files or repeat a parent name in every supporting file.
- Folder names establish ownership; filenames add a responsibility rather than
  repeating the enclosing component/capability name. Import index.svelte with
  an explicit path and a meaningful PascalCase local name. External modules
  consume documented public browser APIs; do not add index.ts to every
  component folder. index.svelte contains component implementation, whereas
  a public index.ts contains named re-exports only. Preserve SvelteKit route
  filenames and other required framework names.
- Project naming exception at the user's request: props.ts may hold component
  input type contracts; interfaces.ts may hold real external port/dependency
  contracts under their owner, for example ports/storage/interfaces.ts. Both
  are type-only. Other named aliases/interfaces follow the global types.ts
  rule. Do not duplicate a contract between these files or split it solely
  because TypeScript offers both type and interface syntax.
- Prefer CSS Modules for authored component styles. Keep global resets, theme
  variables and required framework styles with their explicit global owner.
  Use purpose-named local lib/ operations when a responsibility merits
  extraction; component files must not accumulate unrelated workflow logic.
- Use built-in Svelte stores for auth/messages/conversations and runes for local
  UI state. Each module exposes readable view state and named operations;
  keep mutation ownership private and never share a mutable user store across
  SSR requests. A third-party state/DI container is not part of this scope.
- Nest DI is confined to technical composition/transport adapters. Pure use
  cases receive explicit ports and remain callable without Nest. Svelte context
  may supply a narrow UI capability, but domain/use-case code must not look up
  its dependencies from a global context or service locator.
- Supporting operations for a single domain belong in domains/<owner>/lib/
  or a narrower component/use-case lib/. Extract meaningful independent
  responsibilities, but do not wrap trivial one-use expressions. Keep business
  rules in domain/ and provider I/O in adapters/; lib/ does not replace ownership.
- Repeated behavior with two real matching consumers belongs in the nearest
  common owner's lib/<capability>/ after checking existing APIs. Shared code must
  not import consumer domains, retain their private state or accumulate business
  flags. Reuse matching consumers and preserve errors, fallback, timeout and
  serialization contracts. Similar syntax or equal literals alone is not reuse.
- Put fixed policy numbers/strings, limits, durations, retry counts, protocol
  identifiers, mappings and static defaults in the owning conts.ts with named
  units. Keep functions, I/O and environment reads out of conts.ts. Runtime config
  comes from its validated owner, UI copy stays in locale catalogs, and derived
  runtime values stay with their computation. A shared wire limit has one owner;
  independent policies must not share a constant merely because values match.

FND-02 proves module-style purity for types.ts/*.types.ts, props.ts/interfaces.ts
and conts.ts, plus standard JS/TS Svelte instance/module/legacy module scripts.
The scanner preserves module-to-instance lexical visibility and local shadowing.
Public imports, aliases, cycles, environment ownership and browser/server rules
have positive/negative fixtures; packed installed server-only imports also have
real Kit production-build coverage. Arbitrary preprocessors, markup expressions
and conditional/wildcard package exports remain unsupported; review those paths
manually rather than claiming complete Svelte coverage.

Use the global TypeScript companion rules. Prefer initialized const bindings,
readonly input contracts, typed finite mappings and exhaustive discriminated
unions. Use mappings when one key selects compatible behavior; use switch when
variants need different data. Keep ordered effects visible in the use case.
Do not build a generic workflow interpreter or a folder per trivial expression.
Owner-local `types.ts` and `conts.ts` follow the global rules and are created only
when needed. Zod validates trust boundaries; inferred types avoid duplicate DTOs.
Boxed represents explicit expected outcomes internally, not serialized responses.

For every changed capability, review ownership, entrypoints, dependency direction,
state transitions, transaction boundaries and resource cleanup. A directory tree
and passing lint alone do not prove architecture or correctness.

Use Bun workspaces and mise. Prefer declarative decisions, immutable inputs,
focused operations and explicit outcomes. Do not transfer React or Next.js rules
to SvelteKit/Nest without a concrete contract. Preserve the transferred Biome
severities; architecture style is advisory and module-boundary findings are errors.

## Verification

For tooling changes run `bun run check` (lint, boundary checks, typecheck, tests,
build). Preserve the upstream behavioral fixtures when transferring checks.
Report inherited diagnostics and unsupported source forms honestly. Root checks
include application configs, the preserved internal fe-core boundary policy,
standard Svelte scripts, native typechecks, builds and compatibility tests.
Those source checks do not prove database transactions, runtime identity or
product E2E/abuse. Separate prepared-image core runners implement those phases.

For specification/locale edits validate JSON, matching translation keys and
placeholders, local links and agreement with accepted decisions.

The target acceptance matrix and its implemented owners are maintained in
`docs/testing.md` and `scripts/testing/scenarios`. Full enrolls all 14 media
parts with actual owners; standalone Core keeps those parts deferred and its
disabled profile contract.
Report each actual phase with exact source/image identity. Historical acceptance
does not prove a later source commit; use docs/testing.md and task receipts.
DONE-03 Conversations extraction reuses public behavioral contracts in an
isolated copied host, plus packed installed Kit production boundaries. Headless
browser state has a separate public subpath; styled UI remains browser-owned.
This proves package extraction, not independent microfrontend deployment.
Shutdown requests cancellation, stops new claims and waits for actual settlement
before releasing clients. The 15-second watchdog reports failure; pending jobs
and revocation keys must remain recoverable after unknown effects.

Enroll new application owners and actual transport/service files in the existing
configs when they are created; future root declarations are not proof of an
implemented capability. Preserve positive/negative fixtures for aliases, relative
paths, public subpaths, cycles and browser/server imports, including Svelte
scripts. Preserve current Biome severities and advisory architecture style; do
not suppress findings or silently escalate rules. Review unsupported forms and
semantic ownership/resource cleanup manually. A new framework-marked server
package needs proven SSR enrollment; portable contracts stay framework-neutral.

Use unit tests for pure decisions, real integration tests for transactions and
adapters, isolated abuse tests for adversarial/fault scenarios, and Playwright
for primary user journeys. Prefer observable conditions and bounded barriers to
arbitrary sleeps. Test unknown outcomes and persisted effects, not only statuses.
Never expose fault controls in normal builds or attack non-test environments.
Use synthetic accounts, isolated run-owned resources and Mailpit; preserve all
developer data. Diagnostic artifacts may contain secrets even if app logs are
redacted; restrict their collection, retention and publication.

Every full verification run must report each required phase separately.
Failed setup, unavailable infrastructure, skipped abuse/E2E or a passing retry
must not be presented as an unconditional green result. Report what actually ran,
remaining failures, unsupported environments and known flaky tests.

## Documentation and local planning artifacts

Maintain Russian human-facing documentation with implemented behavior, exact
verification identities and explicit remaining gaps. Keep AGENTS.md in English.
Human documentation must be usable without private AI ledgers or planning files.
Keep AI plans, intermediate reports and docs/superpowers local and out of commits;
do not add a docs/superpowers rule to .gitignore. Stage an explicit reviewed
allowlist, never a blanket add or forced ignored artifacts. Preserve generated
contracts, executable fixtures and media provenance during artifact cleanup.
Before a final amend, complete the agreed source/runtime checks and a separate
whole-change review. Follow an explicit user prohibition on subagents; record an
inline author review honestly rather than calling it independent. Do not publish
or push without separate authorization. Git metadata must not alter the actual
dates or identities recorded for verification.
