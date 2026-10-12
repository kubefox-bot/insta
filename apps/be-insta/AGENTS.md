# Backend working agreements

Follow the root [AGENTS.md](../../AGENTS.md) and global TypeScript companion rules.
This file supplements their ownership and verification contracts.

- `src/app/` is Nest composition and lifecycle ownership. It constructs clients,
  injects validated configuration and registers HTTP/WS handlers. Keep business
  decisions and cross-capability scenarios in their owning use cases.
- `src/domains/` owns users (including auth/directory), conversations (including
  messages/receipts), stories, privacy and support reports. Pure `domain/` and
  `use-cases/` depend inward on owned contracts/ports, never concrete provider
  clients, Nest DI or `Bun.env`. Mongo sessions remain inside transaction adapters.
- Cross-capability imports use declared public entrypoints. Keep `index.ts`
  exports narrow; use `server/index.ts` for provider adapters and documented HTTP
  entrypoints for transport. Internal imports stay direct. Generic `src/lib/`
  must not import its consuming domains. Update existing boundary enrollment when
  adding actual owners; passing folder checks do not prove semantic ownership.
- `src/lib/config/` owns environment access, validation, defaults and secret-safe
  errors. Inject its validated values at composition. Stories runtime policy is
  backend-owned; expose only public policy through REST/OpenAPI/BFF. Never export
  server clients, storage profiles, credentials or config into browser graphs.
- HTTP DTOs generate OpenAPI/Kubb contracts. Reuse Zod-inferred wire types while
  preserving distinct domain semantics. Use real TypeScript string enums in the
  purpose-owned `codes.ts` where the accepted contract calls for enums; retain
  existing wire strings/statuses. Keep `types.ts`, `props.ts`, `interfaces.ts`
  type-only and `conts.ts` limited to static data.
- Preserve message, queue and Stories limits and persisted expiration semantics.
  The current frontend recorder's WebM choice does not retire backend MP4
  support. Core must remain selectable with Stories disabled. Preserve CSS
  Modules in frontend consumers; this backend work does not authorize Sass.
- Resource owners must stop new claims, request cancellation, then await actual
  settlement before releasing borrowed clients. A watchdog failure or unknown
  provider outcome is not success; preserve recoverable jobs, claims and effects.
- Write meaningful Russian TSDoc for authored named operations, including private
  methods. Explain purpose, effects, outcomes and relevant ownership/cleanup
  constraints; do not paraphrase types. Keep README in Russian and AGENTS in
  English. Generated code and anonymous callback bodies are excluded.

## Verification

From the workspace root, use `bun run --cwd apps/be-insta check` and relevant
`test:unit` cases for backend changes. Contract changes require generation/checks
through existing root scripts. Run required root `bun run check` for tooling or
final integration as the parent task requires; avoid repeating it for isolated
comment-only chunks when focused checks and normal hooks are already assigned.
Use AST/token comparison for comment-only source edits, and verify documentation
links, commands and configuration claims against current owners.

Real provider integration, abuse and product E2E require the prepared-image
runners in [docs/testing.md](../../docs/testing.md). Report source/image identity
and each phase separately. Unit/type/build success is not runtime acceptance;
keep unavailable infrastructure, skipped phases and retries explicit. Do not
start infrastructure, publish, push, merge or remove developer data without the
applicable user authorization.
