import type { ScenarioOwner } from "./types";
export const scenarioOwners = [
  {
    key: "A01:access",
    paths: [
      "__tests__/integration/conversations.test.ts",
      "__tests__/abuse/conversations/receipts.test.ts",
      "__tests__/e2e/conversations/chat.spec.ts",
    ],
    expected: "Mallory denied; one pair; no foreign messages",
    faultPoint: "native membership and independent browser contexts",
  },
  {
    key: "A02:credentials",
    paths: [
      "__tests__/integration/auth05/credentials.test.ts",
      "__tests__/integration/auth-native.test.ts",
      "__tests__/integration/users-persistence.test.ts",
      "__tests__/integration/support-registration-proof.test.ts",
    ],
    expected:
      "Invalid/expired credentials and pending setup cannot grant private access",
    faultPoint: "native Bearer and proof boundary",
  },
  {
    key: "A03:cookie-mutations",
    paths: [
      "__tests__/integration/bff-transport.test.ts",
      "__tests__/integration/consent-source.proxy.host.test.ts",
    ],
    expected:
      "Cross-origin mutations rejected; forged ingress cannot alter quota identity",
    faultPoint: "Traefik ingress and BFF Origin guard",
  },
  {
    key: "A04:otp",
    paths: [
      "__tests__/integration/registration/flow.test.ts",
      "__tests__/integration/users-limits.test.ts",
    ],
    expected: "Five errors, one consume, resend preserves deadline/budget",
    faultPoint: "real Dragonfly scripts and two processes",
  },
  {
    key: "A05:activation",
    paths: ["__tests__/abuse/auth/registration.test.ts"],
    expected:
      "Unknown activation commit recovers one user/session; cleanup preserves active account",
    faultPoint: "Mongo commit acknowledgement lost",
  },
  {
    key: "A06:snapshot",
    paths: [
      "__tests__/abuse/auth/registration.test.ts",
      "__tests__/abuse/auth/registration-restore.host.test.ts",
    ],
    expected: "Consumed OTP restored snapshot cannot activate or send again",
    faultPoint:
      "consume→Mongo unknown outcome and isolated broker snapshot restore",
  },
  {
    key: "A07:refresh-fencing",
    paths: ["__tests__/abuse/auth/bff-refresh.test.ts"],
    expected:
      "Two processes fence stale success/rejection and terminal revocation",
    faultPoint: "lease takeover with persisted attempt",
  },
  {
    key: "A08:recovery-cutoff",
    paths: [
      "__tests__/integration/auth-session.test.ts",
      "__tests__/abuse/auth/bff-refresh.test.ts",
    ],
    expected:
      "Original cutoff is fixed; seven-day slide reaches thirty-day cap; revoke never resurrects",
    faultPoint: "injected clock and commit-response loss",
  },
  {
    key: "A09:late-cookie",
    paths: [
      "__tests__/e2e/auth/session.spec.ts",
      "__tests__/e2e/auth/product.spec.ts",
    ],
    expected: "Two tabs retain S2 cookie/current actor after delayed S1 logout",
    faultPoint: "old logout response barrier after new login",
  },
  {
    key: "A10:live-revocation",
    paths: [
      "__tests__/abuse/conversations/delivery.test.ts",
      "__tests__/abuse/conversations/realtime.test.ts",
      "__tests__/abuse/conversations/realtime.host.test.ts",
    ],
    expected:
      "Connected socket is denied after expiry/revoke and fails closed during Mongo outage",
    faultPoint: "connected-recipient auth recheck",
  },
  {
    key: "A11:socket-boundaries",
    paths: [
      "__tests__/abuse/conversations/delivery.test.ts",
      "__tests__/integration/realtime.test.ts",
      "__tests__/abuse/conversations/realtime.test.ts",
    ],
    expected:
      "One-use ticket, strict delivery/notice callbacks, finite envelope and bounded payload/rate",
    faultPoint: "real Socket.io ticket replay and frame intake",
  },
  {
    key: "A12:send-idempotency",
    paths: ["__tests__/integration/messages.test.ts"],
    expected:
      "Ten concurrent sends produce one message/event; changed payload conflicts",
    faultPoint: "Mongo actor-global idempotency race",
  },
  {
    key: "A13:outbox-recovery",
    paths: [
      "__tests__/integration/delivery-ws.test.ts",
      "__tests__/e2e/conversations/delivery-restart.spec.ts",
      "__tests__/e2e/conversations/delivery-state.spec.ts",
      "__tests__/e2e/conversations/delivery.spec.ts",
      "__tests__/abuse/conversations/delivery.test.ts",
      "__tests__/integration/delivery-provider.host.test.ts",
      "__tests__/integration/delivery-isolation.host.test.ts",
      "__tests__/integration/delivery-startup.host.test.ts",
      "__tests__/integration/realtime-streams.host.test.ts",
      "__tests__/integration/delivery-maintenance.host.test.ts",
      "__tests__/integration/delivery-idle-maintenance.host.test.ts",
      "__tests__/integration/realtime-capacity.host.test.ts",
      "__tests__/integration/broker-restore.host.test.ts",
      "__tests__/integration/realtime.test.ts",
      "__tests__/abuse/conversations/send.test.ts",
      "__tests__/integration/conversations-receipts.test.ts",
      "__tests__/e2e/realtime-observability.spec.ts",
    ],
    expected:
      "Committed response loss and per-sink crash retry preserve one message/event",
    faultPoint: "after Mongo commit, before/after sink delivery",
  },
  {
    key: "A14:history-gap",
    paths: [
      "__tests__/integration/delivery-ws.test.ts",
      "__tests__/e2e/conversations/delivery-restart.spec.ts",
      "__tests__/e2e/conversations/delivery-state.spec.ts",
      "__tests__/e2e/conversations/delivery.spec.ts",
      "__tests__/abuse/conversations/delivery.test.ts",
      "__tests__/integration/conversations.test.ts",
      "__tests__/e2e/conversations/chat.spec.ts",
    ],
    expected:
      "Late timestamp commit and snapshot→subscribe gap do not skip or duplicate",
    faultPoint: "Mongo commit barrier and subscribe ACK",
  },
  {
    key: "A15:tab-ownership",
    paths: [
      "__tests__/abuse/conversations/browser-queue.host.test.ts",
      "__tests__/e2e/conversations/outbox.spec.ts",
    ],
    expected:
      "Tab lock release and actor change cannot duplicate or send foreign queue",
    faultPoint: "two tabs and actual cookie re-read",
  },
  {
    key: "A16:queue-boundaries",
    paths: [
      "__tests__/abuse/conversations/browser-queue.host.test.ts",
      "__tests__/e2e/conversations/outbox.spec.ts",
    ],
    expected:
      "N100/N101 shared; quota failure honest; offline no attempts; age requires confirmation",
    faultPoint: "IndexedDB failure and browser clock",
  },
  {
    key: "A21:support",
    paths: [
      "__tests__/abuse/recovery/support.test.ts",
      "__tests__/abuse/recovery/support-restart.test.ts",
    ],
    expected:
      "Mongo before acceptance; unknown SMTP stays pending; retention and worker restart safe",
    faultPoint: "Mongo/SMTP failure, claim-retention race, real broker restart",
  },
  {
    key: "A22:bounded-input",
    paths: [
      "__tests__/integration/users-limits.test.ts",
      "__tests__/integration/http-boundaries.test.ts",
      "__tests__/abuse/recovery/support.test.ts",
      "__tests__/abuse/conversations/realtime.test.ts",
    ],
    expected:
      "N/N+1 limits and per-process sum enforced before expensive effects",
    faultPoint: "bounded input and limiter unavailable",
  },
  {
    key: "A23:redaction",
    paths: [
      "__tests__/integration/observability.host.test.ts",
      "__tests__/abuse/observability/analytics.test.ts",
    ],
    expected:
      "Canaries excluded; sink/logger failure preserves business commit",
    faultPoint: "production process logs and exporter outage",
  },
  {
    key: "A24:canonical-identity",
    paths: [
      "__tests__/integration/analytics.test.ts",
      "__tests__/integration/analytics-replay.test.ts",
      "__tests__/abuse/observability/analytics.test.ts",
    ],
    expected:
      "Same operation correlation cannot collapse distinct canonical effects or forge authority",
    faultPoint: "replay and independent projection sinks",
  },
  {
    key: "A25:proxy-fallback",
    paths: [
      "__tests__/integration/proxy.host.test.ts",
      "__tests__/e2e/conversations/reconnect.spec.ts",
    ],
    expected:
      "TCP works; /event polls/upgrades; /eventual remains FE; non-JSON is technical",
    faultPoint: "Traefik routes and non-JSON upstream",
  },
  {
    key: "A26:pending-revocation",
    paths: [
      "__tests__/integration/bff-session.test.ts",
      "__tests__/abuse/auth/bff-refresh.test.ts",
      "__tests__/integration/observability.host.test.ts",
    ],
    expected:
      "Persisted S1 block survives restart; worker never revokes S2; failure is not pending success",
    faultPoint: "provider unavailable, restart and failed intent write",
  },
  {
    key: "A27:consent-proof",
    paths: [
      "__tests__/integration/consent.test.ts",
      "__tests__/abuse/observability/consent.test.ts",
      "__tests__/integration/consent-source.proxy.host.test.ts",
    ],
    expected:
      "Forged/missing/stale/restored proof denied; necessary effects remain functional",
    faultPoint: "Dragonfly outage/restore and forged ingress",
  },
  {
    key: "A28:consent-revocation",
    paths: [
      "__tests__/abuse/observability/analytics.test.ts",
      "__tests__/e2e/shell/consent.spec.ts",
    ],
    expected:
      "Revoked revision cannot export/backfill; other tabs clear optional state only",
    faultPoint: "delayed intake/outbox and cross-tab revocation",
  },
  {
    key: "E01:guest-private",
    paths: [
      "__tests__/e2e/auth/forms.spec.ts",
      "__tests__/e2e/auth/state.spec.ts",
    ],
    expected:
      "Guest shell has no private data and redirects guarded action to auth",
    faultPoint: "guest SSR/private route",
  },
  {
    key: "E02:registration",
    paths: [
      "__tests__/e2e/auth/product.spec.ts",
      "__tests__/e2e/auth/registration.spec.ts",
    ],
    expected:
      "Actual UI→Mailpit OTP→password→one active account; invalid input is localized",
    faultPoint: "registration UI/reload and native Mailpit",
  },
  {
    key: "E03:logout",
    paths: [
      "__tests__/e2e/auth/product.spec.ts",
      "__tests__/e2e/auth/state.spec.ts",
    ],
    expected:
      "Logout clears private UI; pending failure is honest; S1 remains blocked",
    faultPoint: "logout unavailable native provider",
  },
  {
    key: "E04:composer-continuation",
    paths: ["__tests__/e2e/auth/continuation.spec.ts"],
    expected:
      "Context-selected intent survives reload; no silent send; other context denied",
    faultPoint: "two tabs, reload and unavailable store",
  },
  {
    key: "E05:chat",
    paths: [
      "__tests__/e2e/conversations/chat.spec.ts",
      "__tests__/e2e/conversations/message-marks.spec.ts",
    ],
    expected:
      "Alice/Bob live ordered messages/history and persisted recipient marks; Mallory denied; one pair",
    faultPoint: "independent browser contexts",
  },
  {
    key: "E06:offline",
    paths: [
      "__tests__/e2e/conversations/outbox.spec.ts",
      "__tests__/e2e/conversations/chat.spec.ts",
    ],
    expected: "Offline/reload queue delivers once and does not spend retries",
    faultPoint: "browser network offline and reload",
  },
  {
    key: "E07:queue-confirmation",
    paths: [
      "__tests__/e2e/conversations/outbox.spec.ts",
      "__tests__/e2e/conversations/chat.spec.ts",
    ],
    expected:
      "New login/24h age require explicit confirmation; logout clears owned queue",
    faultPoint: "new generation, actor change and browser clock",
  },
  {
    key: "E08:refresh",
    paths: [
      "__tests__/e2e/auth/session.spec.ts",
      "__tests__/e2e/auth/product.spec.ts",
      "__tests__/abuse/auth/bff-refresh.test.ts",
    ],
    expected:
      "Cookie jar survives old response; recovery cutoff and takeover tested against persisted effects",
    faultPoint: "two tabs plus server injected clock/process barriers",
  },
  {
    key: "E09:reconnect",
    paths: [
      "__tests__/e2e/conversations/reconnect.spec.ts",
      "__tests__/e2e/realtime-observability.spec.ts",
    ],
    expected:
      "WebSocket-only reconnect uses new ticket and retained logical cursor; replay/history preserve one logical message and canonical ID",
    faultPoint: "socket disconnect and persisted response loss",
  },
  {
    key: "E12:support",
    paths: [
      "__tests__/e2e/support/report.spec.ts",
      "__tests__/e2e/support/recovery.spec.ts",
    ],
    expected:
      "One Mongo report; Mailpit receipt separate; failed/unknown draft survives without recursive modal",
    faultPoint: "BFF response loss and context/actor change",
  },
  {
    key: "E13:shell",
    paths: [
      "__tests__/e2e/shell/ssr.spec.ts",
      "__tests__/e2e/conversations/chat.spec.ts",
    ],
    expected:
      "SSR locale/privacy scoped; keyboard/reduced-motion/slow/no-JS shell readable; selection responsive",
    faultPoint: "CPU/network slowdown and hydration asset failure",
  },
  {
    key: "E14:privacy",
    paths: ["__tests__/e2e/shell/consent.spec.ts"],
    expected:
      "Necessary/default no optional network; explicit all then revoke; proof stays private",
    faultPoint: "mobile keyboard, reload and two tabs",
  },
  {
    key: "E12:telemetry",
    paths: ["__tests__/e2e/main-telemetry.spec.ts"],
    expected:
      "Main BFF Faro sanitized body and actual optional receiver receipt; current PRIV01 all required",
    faultPoint: "browser ErrorEvent and consent revocation",
  },
  {
    key: "E03:pending-browser",
    paths: ["__tests__/e2e/auth/faults.spec.ts"],
    expected:
      "Real owned native-port outage persists S1 block; main UI says pending; Back/reload denies S1; cookie retained",
    faultPoint:
      "Test-only BFF session adapter with real shared Mongo, forwarded authentic main form receipt",
  },
  {
    key: "E08:recovery-browser",
    paths: ["__tests__/e2e/auth/faults.spec.ts"],
    expected:
      "Two BFF processes/tabs fence late invalid; original-expiry recovery and exact server cutoff preserve cookie and private access policy",
    faultPoint:
      "Owned BFF native-port commit barrier, main BFF takeover and injected fixture server clock",
  },
  {
    key: "A03:video-multipart",
    paths: [
      "__tests__/abuse/stories/publish.test.ts",
      "__tests__/abuse/stories/capacity.test.ts",
    ],
    expected:
      "Anonymous and malformed multipart denied before body effects; finite provider lifetime admissions",
    faultPoint: "actual native HTTP and held provider settlement",
  },
  {
    key: "A17:media-validation",
    paths: ["__tests__/integration/stories/media.test.ts"],
    expected:
      "Native MP4 H264/AAC and WebM VP8/VP9 Opus whole-file inspection enforce duration/horizon, stored MIME, bytes and decoder budgets",
    faultPoint:
      "synthetic native recordings and corrupt packet/sample fixtures",
  },
  {
    key: "A18:late-put",
    paths: [
      "__tests__/integration/stories/feed-cleanup.test.ts",
      "__tests__/abuse/stories/recovery.test.ts",
    ],
    expected:
      "Unknown late PUT stays accounted until authoritative reconciliation",
    faultPoint: "held provider and failed Mongo ownership read",
  },
  {
    key: "A19:storage-profile",
    paths: ["__tests__/integration/stories/maintenance.test.ts"],
    expected:
      "Retained profile cursor survives outage while bounded healthy work proceeds",
    faultPoint: "provider inventory failure with persisted cursor",
  },
  {
    key: "A20:story-cache",
    paths: [
      "__tests__/integration/stories/feed-cleanup.test.ts",
      "__tests__/abuse/stories/publish.test.ts",
    ],
    expected:
      "Version fence and active expiry survive stale fill; Mongo fallback is bounded",
    faultPoint: "Dragonfly fill barrier and held Mongo fallback",
  },
  {
    key: "A23:signed-playback-url",
    paths: [
      "__tests__/integration/stories/storage.test.ts",
      "__tests__/integration/stories/observability.test.ts",
    ],
    expected:
      "Private signed playback and canonical projection exclude media secrets",
    faultPoint: "real RustFS signature and persisted outbox projection",
  },
  {
    key: "A25:video-range",
    paths: [
      "__tests__/integration/stories/storage.test.ts",
      "__tests__/e2e/stories/public.spec.ts",
    ],
    expected: "Actual signed Range and browser seeking preserve private origin",
    faultPoint: "Traefik TLS Range and native browser player",
  },
  {
    key: "E01:public-video",
    paths: ["__tests__/e2e/stories/public.spec.ts"],
    expected: "Guest sees public author DTO and selected playable media",
    faultPoint: "guest SSR and real browser playback",
  },
  {
    key: "E03:story-feed",
    paths: [
      "__tests__/e2e/stories/public.spec.ts",
      "__tests__/e2e/stories/recovery.spec.ts",
    ],
    expected:
      "Session transitions retain public feed and clear private recorder state",
    faultPoint: "logout and unknown publication recovery",
  },
  {
    key: "E04:recorder-continuation",
    paths: ["__tests__/e2e/stories/continuation.spec.ts"],
    expected:
      "Auth resumes original Blob only with explicit confirmation and same operation",
    faultPoint: "real auth modal, reload and original private owner",
  },
  {
    key: "E10:media",
    paths: [
      "__tests__/e2e/stories/record.spec.ts",
      "__tests__/e2e/stories/recorder-resources.spec.ts",
    ],
    expected:
      "Native recording final chunk, strict auto-stop and resource cleanup",
    faultPoint:
      "synthetic camera/audio only; physical OS permission remains manual",
  },
  {
    key: "E11:story-expiry",
    paths: ["__tests__/e2e/stories/expiry.spec.ts"],
    expected:
      "Actual persisted expiry removes feed/player without stale URL reuse",
    faultPoint: "test-host owned expiry and browser deadline",
  },
  {
    key: "E13:media-bounds",
    paths: [
      "__tests__/e2e/conversations/marks-story-overlay.spec.ts",
      "__tests__/e2e/stories/layout.spec.ts",
      "__tests__/e2e/stories/recorder-resources.spec.ts",
    ],
    expected:
      "Responsive localized media dialog owns resources and errors; native player suppresses reads until visible rows are revealed",
    faultPoint:
      "native channels at constrained viewports and synthetic hardware failure",
  },
  {
    key: "E14:publish",
    paths: [
      "__tests__/e2e/stories/record.spec.ts",
      "__tests__/e2e/stories/observability.spec.ts",
      "__tests__/integration/stories/observability.test.ts",
    ],
    expected:
      "Publication remains functional in necessary mode; optional goals require current consent",
    faultPoint:
      "real atomic Mongo publication and active visible browser playing",
  },
] as const satisfies readonly ScenarioOwner[];
