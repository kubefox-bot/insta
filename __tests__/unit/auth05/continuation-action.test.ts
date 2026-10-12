import { expect, test } from "bun:test";
import { get, writable } from "svelte/store";
import type {
  IntentInput,
  RecoveryIdentity,
} from "../../../apps/fe-insta/src/domains/auth-continuation/browser/index";
import {
  createContinuationAction,
  createRecovery,
} from "../../../apps/fe-insta/src/domains/auth-continuation/browser/index";
import { createPendingDrafts } from "../../../apps/fe-insta/src/domains/conversations/browser/drafts/pending";
import type {
  FeedGroup,
  PlayerView,
} from "../../../apps/fe-insta/src/domains/stories/browser/index";
import { createContactOperation } from "../../../apps/fe-insta/src/domains/stories/components/StoryPlayer/contact/create";
import { createAuthBrowser } from "../../../apps/fe-insta/src/domains/users/browser/store";

const alice = { userId: "alice", generation: "S1" };
const guest: RecoveryIdentity = { status: "guest", actor: null };
const member: RecoveryIdentity = { status: "authenticated", actor: alice };
const selectedStory = (id: string): PlayerView => {
  const story = {
    id: `story-${id}`,
    author: { id, username: id },
    publishedAt: 1000,
    expiresAt: 10000,
    durationMs: 1000,
  };
  const group: FeedGroup = {
    author: story.author,
    latestPublishedAt: 1000,
    stories: [story],
  };
  return {
    kind: "ready",
    group,
    index: 0,
    story,
    playback: { url: "https://localhost/test.mp4", expiresAt: 9000 },
  };
};
/** Связывает реальные contact/action/recovery owners; задерживает только внешний create transport. */
const scenario = (initial: RecoveryIdentity) => {
  const identity = writable(initial);
  const selection = writable(selectedStory("A"));
  const creates = new Map<
    string,
    ReturnType<
      typeof Promise.withResolvers<
        Readonly<{ intentId: string; expiresAt: number }>
      >
    >
  >();
  const requests: IntentInput[] = [];
  const cancelled: string[] = [];
  const effects: string[] = [];
  const subscriptions = { active: 0 };
  const recovery = createRecovery({
    pending: createPendingDrafts(),
    uuid: () => "unused",
    create: (input) => {
      requests.push(input);
      const pending =
        Promise.withResolvers<
          Readonly<{ intentId: string; expiresAt: number }>
        >();
      creates.set(input.operationId, pending);
      return pending.promise;
    },
    cancel: async (id) => {
      cancelled.push(id);
      return true;
    },
  });
  recovery.reconcile(initial);
  const action = createContinuationAction({
    begin: recovery.begin,
    cancel: recovery.cancel,
    currentIdentity: () => get(identity),
    subscribeIdentity: (run) => {
      subscriptions.active++;
      const release = identity.subscribe(run);
      return () => {
        subscriptions.active--;
        release();
      };
    },
    openConversation: async ({ intentId }) => {
      effects.push(`conversation:${intentId}`);
    },
    openStory: async ({ intentId }) => {
      effects.push(`story:${intentId}`);
    },
    openAuthentication: ({ intentId }) => {
      effects.push(`auth:${intentId}`);
    },
  });
  const contact = createContactOperation({
    selection,
    close: () => selection.set({ kind: "closed" }),
    requestConversation: async ({ authorId, isSelected }) => {
      await action.begin({
        input: {
          type: "open_conversation",
          recipientId: authorId,
          operationId: authorId,
        },
        trigger: null,
        isSelected,
      });
    },
  });
  return {
    identity,
    selection,
    requests,
    cancelled,
    effects,
    recovery,
    action,
    contact,
    subscriptions,
    resolve: (id: string) => {
      const pending = creates.get(id);
      if (!pending) throw new Error(`Missing create ${id}`);
      pending.resolve({ intentId: id, expiresAt: Date.now() + 60000 });
    },
    dispose: () => {
      contact.dispose();
      action.dispose();
      recovery.dispose();
    },
  };
};

for (const initial of [guest, member]) {
  for (const change of [
    "close",
    "reopen",
    "select-B",
    "departure",
    "dispose",
    "actor",
    "generation",
    "ABA",
  ] as const) {
    test(
      initial.status +
        " late contact after " +
        change +
        " cancels only A without navigation or auth dialog",
      async () => {
        const s = scenario(initial);
        try {
          const pending = s.contact.run();
          switch (change) {
            case "close":
              s.selection.set({ kind: "closed" });
              break;
            case "reopen":
              s.selection.set({ kind: "closed" });
              s.selection.set(selectedStory("A"));
              break;
            case "select-B":
              s.selection.set(selectedStory("B"));
              break;
            case "departure":
              s.action.invalidate();
              break;
            case "dispose":
              s.action.dispose();
              break;
            case "actor":
              s.identity.set({
                status: "authenticated",
                actor: { userId: "bob", generation: "S2" },
              });
              break;
            case "generation":
              s.identity.set({
                status: "authenticated",
                actor: { ...alice, generation: "S2" },
              });
              break;
            case "ABA":
              s.identity.set(initial.actor ? guest : member);
              s.identity.set(initial);
              break;
          }
          s.resolve("A");
          await pending;
          expect(s.effects).toEqual([]);
          expect(s.cancelled).toEqual(["A"]);
          expect(get(s.recovery.view)).toEqual({ kind: "idle" });
        } finally {
          s.dispose();
        }
      },
    );
  }
  test(
    initial.status +
      " current selection hands off once and later invalidation does not cancel it",
    async () => {
      const s = scenario(initial);
      try {
        const pending = s.contact.run();
        await s.contact.run();
        s.resolve("A");
        await pending;
        s.action.invalidate();
        s.action.dispose();
        expect(s.effects).toEqual([
          initial.actor ? "conversation:A" : "auth:A",
        ]);
        expect(s.cancelled).toEqual([]);
        expect(s.requests).toHaveLength(1);
        expect(get(s.selection)).toEqual({ kind: "closed" });
        expect(get(s.recovery.view)).toMatchObject({
          kind: "ready",
          intentId: "A",
        });
      } finally {
        s.dispose();
      }
    },
  );
  test(
    initial.status +
      " real recovery cancels displaced A once while preserving handed-off B",
    async () => {
      const s = scenario(initial);
      try {
        const a = s.contact.run();
        s.selection.set(selectedStory("B"));
        const b = s.contact.run();
        s.resolve("B");
        await b;
        s.resolve("A");
        await a;
        expect(s.cancelled).toEqual(["A"]);
        expect(s.effects).toEqual([
          initial.actor ? "conversation:B" : "auth:B",
        ]);
        expect(get(s.recovery.view)).toMatchObject({
          kind: "ready",
          intentId: "B",
        });
      } finally {
        s.dispose();
      }
    },
  );
}
test("action owns and releases its synchronous identity subscription", () => {
  const s = scenario(guest);
  try {
    expect(s.subscriptions.active).toBe(1);
    s.action.dispose();
    s.action.dispose();
    expect(s.subscriptions.active).toBe(0);
  } finally {
    s.dispose();
  }
});

for (const timing of ["targeted", "displaced"] as const) {
  for (const outcome of ["false", "throw"] as const) {
    test(
      timing +
        " failed A cleanup " +
        outcome +
        " reports once without invalidating B via auth diagnostics",
      async () => {
        const createdA =
          Promise.withResolvers<
            Readonly<{ intentId: string; expiresAt: number }>
          >();
        const createdB =
          Promise.withResolvers<
            Readonly<{ intentId: string; expiresAt: number }>
          >();
        const auth = createAuthBrowser({
          initial: { actor: null, status: "guest" },
          read: async () => null,
          clearPrivate: () => {
            throw new Error("Diagnostic must not clear identity");
          },
          synchronization: {
            exclusive: async (run) => run(),
            publish: () => {},
            subscribe: () => () => {},
          },
        });
        const failures: string[] = [];
        const effects: string[] = [];
        const cancelled: string[] = [];
        const recovery = createRecovery({
          pending: createPendingDrafts(),
          uuid: () => "unused",
          create: (input) =>
            input.operationId === "A" ? createdA.promise : createdB.promise,
          cancel: async (id) => {
            cancelled.push(id);
            if (outcome === "throw") throw new Error("Transport failed");
            return false;
          },
          onCleanupFailure: () => {
            failures.push("cleanup");
            auth.reportPrivateCleanupFailure();
          },
        });
        const action = createContinuationAction({
          begin: async (input) => {
            const receipt = await recovery.begin(input);
            if (timing === "targeted" && input.input.operationId === "A")
              startB();
            return receipt;
          },
          cancel: recovery.cancel,
          currentIdentity: () => get(auth.view),
          subscribeIdentity: auth.view.subscribe,
          openConversation: async ({ intentId }) => {
            effects.push(intentId);
          },
          openStory: async () => {},
          openAuthentication: ({ intentId }) => {
            effects.push(intentId);
          },
        });
        const selection = writable(selectedStory("A"));
        const contact = createContactOperation({
          selection,
          close: () => selection.set({ kind: "closed" }),
          requestConversation: async ({ authorId, isSelected }) => {
            await action.begin({
              input: {
                type: "open_conversation",
                operationId: authorId,
                recipientId: authorId,
              },
              trigger: null,
              isSelected,
            });
          },
        });
        let b: Promise<void> | undefined;
        const startB = () => {
          selection.set(selectedStory("B"));
          b = contact.run();
        };
        try {
          const a = contact.run();
          if (timing === "displaced") startB();
          createdA.resolve({ intentId: "A", expiresAt: Date.now() + 60000 });
          await a;
          expect(failures).toEqual(["cleanup"]);
          expect(cancelled).toEqual(["A"]);
          expect(effects).toEqual([]);
          expect(get(recovery.view)).toEqual({ kind: "creating" });
          expect(get(auth.view)).toMatchObject({
            status: "guest",
            actor: null,
            issue: "PRIVATE_CLEANUP_FAILED",
          });
          createdB.resolve({ intentId: "B", expiresAt: Date.now() + 60000 });
          await b;
          expect(effects).toEqual(["B"]);
          expect(get(recovery.view)).toMatchObject({
            kind: "ready",
            intentId: "B",
          });
        } finally {
          contact.dispose();
          action.dispose();
          recovery.dispose();
        }
      },
    );
  }
}
for (const status of ["pending", "unavailable"] as const) {
  test(`${status} identity cannot create a continuation`, async () => {
    const s = scenario({ actor: null, status });
    try {
      expect(
        await s.action.begin({
          input: { type: "create_story", operationId: "A" },
          trigger: null,
          isSelected: () => true,
        }),
      ).toBe("unavailable");
      expect(s.requests).toEqual([]);
      expect(s.effects).toEqual([]);
    } finally {
      s.dispose();
    }
  });
}
test("a disposed or already deselected action performs no create", async () => {
  const s = scenario(guest);
  try {
    const input = {
      input: { type: "create_story", operationId: "A" } as const,
      trigger: null,
      isSelected: () => false,
    };
    expect(await s.action.begin(input)).toBe("stale");
    s.action.dispose();
    expect(await s.action.begin({ ...input, isSelected: () => true })).toBe(
      "stale",
    );
    expect(s.requests).toEqual([]);
  } finally {
    s.dispose();
  }
});
test("authenticated create Story transfers ownership before its own navigation invalidates the action", async () => {
  const cancelled: string[] = [];
  const effects: string[] = [];
  const recovery = createRecovery({
    pending: createPendingDrafts(),
    uuid: () => "unused",
    create: async () => ({ intentId: "story", expiresAt: Date.now() + 60000 }),
    cancel: async (id) => {
      cancelled.push(id);
      return true;
    },
  });
  const identity = writable(member);
  const action = createContinuationAction({
    begin: recovery.begin,
    cancel: recovery.cancel,
    currentIdentity: () => get(identity),
    subscribeIdentity: identity.subscribe,
    openConversation: async () => {
      throw new Error("Wrong effect");
    },
    openAuthentication: () => {
      throw new Error("Wrong effect");
    },
    openStory: async ({ intentId, trigger }) => {
      expect(trigger).toBeNull();
      action.invalidate();
      effects.push(intentId);
    },
  });
  try {
    expect(
      await action.begin({
        input: { type: "create_story", operationId: "S" },
        trigger: null,
        isSelected: () => true,
      }),
    ).toBe("applied");
    expect(effects).toEqual(["story"]);
    expect(cancelled).toEqual([]);
  } finally {
    action.dispose();
    recovery.dispose();
  }
});
