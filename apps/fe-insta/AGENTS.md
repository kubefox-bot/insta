# Frontend and BFF agreements

These instructions supplement the root [AGENTS.md](../../AGENTS.md). Keep user-facing
explanations, README and authored operation TSDoc in Russian. Do not infer new
feature, publication or infrastructure authorization from this file.

## Ownership and public contracts

- Keep SvelteKit routes/hooks as transport and composition. `src/app` constructs
  clients and connects lifecycle; business scenarios belong to their capability.
  BFF adapts browser sessions to Nest REST; do not introduce another transport.
- Consume domain `browser/index.ts` and `server/index.ts` public APIs. Conversations
  also expose `browser/state/index.ts` for headless state consumers. Internal files
  import their own implementation directly; do not expose internals just to simplify
  a route import. Keep shared mechanisms free of domain imports.
- Preserve server-only boundaries in `api-boundaries.config.json` and
  `module-boundaries.config.json`. Generated clients, session keys, backend tokens,
  database clients and server configuration must never enter browser imports.
  Register actual new owners/transport files in the existing boundary configuration.
- Read environment only through its validated owner in `src/lib/config/server` or
  `config/host-dev`. Pass configuration into operations. Backend owns Stories upload
  and lifetime policy; consume its generated REST response through BFF validation.
  Do not recreate it in browser environment or test configuration. Preserve existing
  public compatibility contracts until their consumers and retirement are explicit.
- Backend DTOs own OpenAPI; use root contract generation/check scripts for SDK
  changes. Never hand-edit `src/lib/api/generated`. Validate external wire data once
  at its owning boundary; retain distinct domain models when semantics differ.

## Browser state and presentation

- Expose readable view state and named operations; keep mutation private. Use
  Svelte stores for auth/messages/conversations and runes for local UI state.
  Do not share mutable user state between SSR requests.
- Svelte context connects narrow UI capabilities at composition. Domain/use-case
  operations receive explicit dependencies and must not query context themselves.
- Keep styled/stateful components under `components/ComponentName/index.svelte`.
  Use local `styles.module.css` and `props.ts` when needed; preserve explicit global
  reset/theme owners. Do not migrate CSS Modules to Sass as incidental cleanup.
- Keep UI copy in locale catalogs and presentation dates/numbers in Intl. Preserve
  injected clocks, persistence timestamps and protocol serialization semantics.
- Use real TypeScript string enums in purpose-owned `codes.ts` where the approved
  migration calls for them, preserving wire strings. `types.ts`/`props.ts` remain
  type-only; `conts.ts` owns static policy and mappings without environment reads.
- The owner acquiring subscriptions, timers, channels, sockets, object URLs, camera
  tracks or database handles owns cleanup on success, failure and cancellation.
  Keep cleanup promises observable; request cancellation is not proof of settlement.
  Preserve actor/generation guards against late results and logout private cleanup.
- Optional telemetry requires current privacy consent. Necessary mode retains core
  behavior and minimal operational server logs; do not silently enable Faro.

## Documentation and verification

Document the purpose and observable effects/outcomes of changed named operations,
including private and Svelte script operations. Describe resource ownership and
cancellation where relevant; avoid paraphrasing names or types. Generated code and
anonymous callbacks are not documentation targets.

Use the existing checks according to changed behavior: app `check` runs Kit sync
and Svelte/native type checks; `test:unit`, `test:compiler` and `test:config` cover
their declared focused suites. Root `contracts:check` and boundary checks protect
integration contracts. Follow the root required verification and
[testing guide](../../docs/testing.md); this file introduces no additional gate.
Report warnings and unrun phases, and separate source checks from prepared-image
Core/Full, browser, camera and shutdown evidence. For comment-only edits, verify
executable AST/token equivalence and unchanged Svelte markup rather than creating
tests that merely assert comments. Preserve current lint severities and existing
behavioral fixtures.
