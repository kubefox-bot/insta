import { get } from "svelte/store";
import { createRecovery } from "../../../../apps/fe-insta/src/domains/auth-continuation/browser/index";
import { createPendingDrafts } from "../../../../apps/fe-insta/src/domains/conversations/browser/drafts/pending";
import type { Actor } from "../../../../apps/fe-insta/src/domains/users/browser/types";

export const createRootRecovery = async ({
  actor,
  intentId,
}: Readonly<{ actor: Actor; intentId: string }>) => {
  const pending = createPendingDrafts();
  const selected =
    Promise.withResolvers<Readonly<{ intentId: string; expiresAt: number }>>();
  const restored: string[] = [];
  const recovery = createRecovery({
    pending,
    create: () => selected.promise,
    cancel: async () => true,
    uuid: () => "operation",
  });
  const expired = { ...actor, generation: "expired-generation" };
  const releaseSource = recovery.connect({
    capture: () => ({
      actor: expired,
      recipientId: "bob",
      text: "root-owned private draft",
    }),
    restore: ({ text }) => restored.push(text),
  });
  recovery.suspend({ actor: expired, status: "authenticated" });
  recovery.reconcile({ actor: null, status: "guest" });
  selected.resolve({ intentId, expiresAt: Date.now() + 60000 });
  await selected.promise;
  await Promise.resolve();
  if (get(recovery.view).kind !== "ready")
    throw new Error("Expected real selected root recovery");
  recovery.reconcile({ actor, status: "authenticated" });
  return { recovery, pending, restored, releaseSource };
};
