import { get } from "svelte/store";
import { z } from "zod";
import { createConversationStore } from "../../../../apps/fe-insta/src/domains/conversations/browser/store";
import { createAuthBrowser } from "../../../../apps/fe-insta/src/domains/users/browser/store";
import { registerRuntimeProviders } from "./providers";
import { createRootRecovery } from "./recovery";

registerRuntimeProviders();
const { createConversationRuntime } = await import(
  "../../../../apps/fe-insta/src/app/conversations/browser/index"
);
const mode = z
  .enum([
    "disposed-success",
    "disposed-rejection",
    "disposed-navigation",
    "resume-after-dispose",
    "generation-success",
    "generation-rejection",
    "active-success",
    "active-rejection",
  ])
  .parse(process.argv[2]);
const actor = {
  userId: "alice",
  username: "Alice",
  generation: "same-generation",
};
const intentId = crypto.randomUUID();
const root = await createRootRecovery({ actor, intentId });
const auth = createAuthBrowser({
  initial: { actor, status: "authenticated" },
  read: async () => actor,
  synchronization: {
    exclusive: (execute) => execute(),
    publish: () => {},
    subscribe: () => () => {},
  },
  clearPrivate: () => {},
});
const releaseIdentity = auth.view.subscribe(root.recovery.reconcile);
const store = createConversationStore({ initial: [], actor });
const response = Promise.withResolvers<Response>();
const navigation = Promise.withResolvers<void>();
const navigationStarted = Promise.withResolvers<void>();
const calls = { fetch: 0, navigate: 0, resumed: 0, rejected: 0 };
globalThis.fetch = Object.assign(
  async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    if (
      input !== `/api/auth/continuation/${intentId}/resume` ||
      init?.method !== "POST"
    )
      throw new Error(`Unexpected request ${input}`);
    calls.fetch++;
    return response.promise;
  },
  {
    preconnect: () => {
      throw new Error("Unexpected network preconnect");
    },
  },
);
const runtime = createConversationRuntime({
  actor,
  store,
  auth,
  initialHydration: true,
  navigate: async () => {
    calls.navigate++;
    navigationStarted.resolve();
    if (mode === "disposed-navigation") await navigation.promise;
  },
  onResumed: (input) => {
    calls.resumed++;
    root.recovery.restore({ ...input, actor });
  },
  onRejected: (id) => {
    calls.rejected++;
    root.recovery.reject(id);
  },
});
const dispose = () => {
  runtime.dispose();
  root.releaseSource();
};
try {
  if (mode === "resume-after-dispose") dispose();
  const operation = runtime.resume({ intentId });
  if (mode === "disposed-success" || mode === "disposed-rejection") dispose();
  if (mode === "generation-success" || mode === "generation-rejection")
    auth.accept({ ...actor, generation: "changed-generation" });
  response.resolve(
    mode?.endsWith("rejection")
      ? Response.json(
          { ok: false, error: { code: "INTENT_UNAVAILABLE" } },
          { status: 410 },
        )
      : Response.json({
          ok: true,
          data: { type: "compose_message", conversationId: "safe" },
        }),
  );
  if (mode === "disposed-navigation") {
    await navigationStarted.promise;
    dispose();
    navigation.resolve();
  }
  const result = await operation;
  console.log(
    JSON.stringify({
      result,
      calls,
      generation: get(auth.view).actor?.generation,
      recoveryKind: get(root.recovery.view).kind,
      restored: root.restored,
      pendingText:
        root.pending.take({ intentId, actorId: actor.userId }) ?? null,
    }),
  );
} finally {
  if (!mode?.startsWith("disposed") && mode !== "resume-after-dispose")
    dispose();
  releaseIdentity();
  root.recovery.dispose();
}
