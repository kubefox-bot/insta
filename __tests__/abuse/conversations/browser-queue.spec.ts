import { expect, test } from "../../fixtures/browser-egress/test";
import type {} from "../../fixtures/outbox/browser";
import { cleanupOutbox } from "../../fixtures/outbox/cleanup";
import { connectOutbox, loginOutbox } from "../../fixtures/outbox/setup";
import { startOutboxPair } from "../../fixtures/outbox/start-pair";
import { startRealtimeFixture } from "../../fixtures/realtime/start-browser";

for (const cancellation of ["dispose", "reauth"] as const) {
  test(`CHAT-04 fix1 native pending confirmation commit ${cancellation} aborts transaction before durable selection`, async ({
    page,
    context,
  }) => {
    test.setTimeout(60000);
    const fixture = await startRealtimeFixture();
    const namespace = `insta-chat04-${crypto.randomUUID()}`;
    const observer = await context.newPage();
    try {
      await loginOutbox(page, fixture.account);
      await connectOutbox({
        page,
        namespace,
        conversationId: fixture.conversationId,
      });
      await connectOutbox({
        page: observer,
        namespace,
        conversationId: fixture.conversationId,
      });
      const queued = await page.evaluate(() =>
        window.__outboxProbe.enqueue("pending commit synthetic"),
      );
      if (!queued.ok || !queued.record) throw Error("Enqueue failed");
      await page.evaluate(() => window.__outboxProbe.now(86400000));
      await page.evaluate(() => window.__outboxProbe.drain());
      const before = await observer.evaluate(() => window.__outboxProbe.list());
      expect(before[0]).toMatchObject({
        state: "confirmation",
        needsConfirmation: true,
      });
      await page.evaluate(() => window.__outboxProbe.holdConfirmationCommit());
      const pending = page.evaluate(
        (id) => window.__outboxProbe.confirmHeld([id]),
        queued.record.operationId,
      );
      await expect
        .poll(() => page.evaluate(() => window.__outboxProbe.commitStarted()))
        .toBe(true);
      expect(
        await page.evaluate(() => window.__outboxProbe.commitOutcome()),
      ).toEqual({ aborted: false, committed: false });
      if (cancellation === "dispose")
        await page.evaluate(() => window.__outboxProbe.disposeConfirmation());
      else {
        await loginOutbox(page, fixture.account);
        await page.evaluate(() => window.__outboxProbe.reconcile());
      }
      expect(await pending).toEqual({ ok: false, error: "ACTOR_CHANGED" });
      await expect
        .poll(() => page.evaluate(() => window.__outboxProbe.commitOutcome()))
        .toEqual({ aborted: true, committed: false });
      await page.evaluate(() => window.__outboxProbe.releaseCommit());
      expect(
        await observer.evaluate(() => window.__outboxProbe.list()),
      ).toEqual(before);
      expect(await page.evaluate(() => window.__outboxProbe.sendCalls())).toBe(
        0,
      );
      expect(
        (await (await fetch(`${fixture.url}/history`)).json()).data.items,
      ).toHaveLength(0);
    } finally {
      await cleanupOutbox({
        tabs: [page, observer],
        namespace,
        disposers: [fixture.dispose],
      });
    }
  });
}

test("CHAT-04 fix1 manual sent attempt abort and reload require new selection before another send", async ({
  page,
}) => {
  test.setTimeout(60000);
  const fixture = await startRealtimeFixture();
  const namespace = `insta-chat04-${crypto.randomUUID()}`;
  try {
    await loginOutbox(page, fixture.account);
    const original = await connectOutbox({
      page,
      namespace,
      conversationId: fixture.conversationId,
    });
    const queued = await page.evaluate(() =>
      window.__outboxProbe.enqueue("manual abort synthetic"),
    );
    if (!queued.ok || !queued.record) throw Error("Enqueue failed");
    await page.evaluate(() => window.__outboxProbe.now(86400000));
    expect((await page.evaluate(() => window.__outboxProbe.drain())).sent).toBe(
      0,
    );
    expect(
      await page.evaluate(
        (id) => window.__outboxProbe.confirm([id]),
        queued.record.operationId,
      ),
    ).toBe(1);
    await page.evaluate(() => window.__outboxProbe.holdPostRead());
    const pending = page.evaluate(() => window.__outboxProbe.drain());
    await expect
      .poll(() => page.evaluate(() => window.__outboxProbe.postReadStarted()))
      .toBe(true);
    expect(
      (await (await fetch(`${fixture.url}/history`)).json()).data.items,
    ).toHaveLength(1);
    await page.evaluate(() => window.__outboxProbe.abortDrain());
    expect((await pending).confirmed).toBe(0);
    const retained = await page.evaluate(() => window.__outboxProbe.list());
    expect(retained[0]).toMatchObject({
      manualAttempt: false,
      state: "confirmation",
      needsConfirmation: true,
      attempts: 1,
      key: queued.record.key,
      createdAt: 0,
    });
    await page.evaluate(() => window.__outboxProbe.close());
    const restored = await connectOutbox({
      page,
      namespace,
      conversationId: fixture.conversationId,
    });
    expect(restored.generation).toBe(original.generation);
    await page.evaluate(() => window.__outboxProbe.now(86410000));
    expect((await page.evaluate(() => window.__outboxProbe.drain())).sent).toBe(
      0,
    );
    expect(await page.evaluate(() => window.__outboxProbe.sendCalls())).toBe(0);
    expect(await page.evaluate(() => window.__outboxProbe.list())).toEqual(
      retained,
    );
    expect(
      await page.evaluate(
        (id) => window.__outboxProbe.confirm([id]),
        queued.record.operationId,
      ),
    ).toBe(1);
    expect(
      (await page.evaluate(() => window.__outboxProbe.drain())).confirmed,
    ).toBe(1);
    expect(
      (await (await fetch(`${fixture.url}/history`)).json()).data.items,
    ).toHaveLength(1);
    expect(await page.evaluate(() => window.__outboxProbe.list())).toHaveLength(
      0,
    );
  } finally {
    await cleanupOutbox({
      tabs: [page],
      namespace,
      disposers: [fixture.dispose],
    });
  }
});

test("CHAT-04 fix1 late confirmed delete CAS retains concurrent real generation selection", async ({
  page,
  context,
}) => {
  test.setTimeout(60000);
  const fixture = await startRealtimeFixture();
  const namespace = `insta-chat04-${crypto.randomUUID()}`;
  const second = await context.newPage();
  try {
    await loginOutbox(page, fixture.account);
    const original = await connectOutbox({
      page,
      namespace,
      conversationId: fixture.conversationId,
    });
    await connectOutbox({
      page: second,
      namespace,
      conversationId: fixture.conversationId,
    });
    const queued = await page.evaluate(() =>
      window.__outboxProbe.enqueue("CAS concurrent synthetic"),
    );
    if (!queued.ok || !queued.record) throw Error("Enqueue failed");
    await page.evaluate(() => window.__outboxProbe.holdDelete());
    const pending = page.evaluate(() => window.__outboxProbe.drain());
    await expect
      .poll(() => page.evaluate(() => window.__outboxProbe.deleteStarted()))
      .toBe(true);
    await loginOutbox(second, fixture.account);
    const next = await second.evaluate(() => window.__outboxProbe.reconcile());
    expect(next?.generation).not.toBe(original.generation);
    expect(
      (await second.evaluate(() => window.__outboxProbe.drain())).sent,
    ).toBe(0);
    expect(
      await second.evaluate(
        (id) => window.__outboxProbe.confirm([id]),
        queued.record.operationId,
      ),
    ).toBe(1);
    const retained = await second.evaluate(() => window.__outboxProbe.list());
    expect(retained[0]).toMatchObject({
      lastAuthGeneration: next?.generation,
      manualAttempt: true,
      revision: 3,
      key: queued.record.key,
      createdAt: 0,
    });
    await page.evaluate(() => window.__outboxProbe.releaseDelete());
    expect((await pending).confirmed).toBe(0);
    expect(await second.evaluate(() => window.__outboxProbe.list())).toEqual(
      retained,
    );
    expect(
      (await (await fetch(`${fixture.url}/history`)).json()).data.items,
    ).toHaveLength(1);
  } finally {
    if (!page.isClosed())
      await page.evaluate(() => window.__outboxProbe.releaseDelete());
    await cleanupOutbox({
      tabs: [page, second],
      namespace,
      disposers: [fixture.dispose],
    });
  }
});

for (const cancellation of ["dispose", "reauth"] as const) {
  test(`CHAT-04 held confirmation ${cancellation} cancels owned read and retains immutable selection without sending`, async ({
    page,
    context,
  }) => {
    test.setTimeout(60000);
    const fixture = await startRealtimeFixture();
    const namespace = `insta-chat04-${crypto.randomUUID()}`;
    const observer = await context.newPage();
    try {
      await loginOutbox(page, fixture.account);
      const original = await connectOutbox({
        page,
        namespace,
        conversationId: fixture.conversationId,
      });
      await connectOutbox({
        page: observer,
        namespace,
        conversationId: fixture.conversationId,
      });
      const queued = await page.evaluate(() =>
        window.__outboxProbe.enqueue("held confirmation synthetic"),
      );
      if (!queued.ok || !queued.record) throw new Error("Enqueue failed");
      await page.evaluate(() => window.__outboxProbe.now(86400000));
      expect(
        (await page.evaluate(() => window.__outboxProbe.drain())).sent,
      ).toBe(0);
      const before = await observer.evaluate(() => window.__outboxProbe.list());
      expect(before[0]).toMatchObject({
        state: "confirmation",
        needsConfirmation: true,
      });
      await page.evaluate(() => window.__outboxProbe.holdConfirmation());
      const pending = page.evaluate(
        (id) => window.__outboxProbe.confirmHeld([id]),
        queued.record.operationId,
      );
      await expect
        .poll(() => page.evaluate(() => window.__outboxProbe.postReadStarted()))
        .toBe(true);
      if (cancellation === "reauth") {
        await loginOutbox(page, fixture.account);
        const next = await page.evaluate(() =>
          window.__outboxProbe.reconcile(),
        );
        expect(next?.generation).not.toBe(original.generation);
      } else {
        await page.evaluate(() => window.__outboxProbe.disposeConfirmation());
      }
      expect(await pending).toEqual({ ok: false, error: "ACTOR_CHANGED" });
      await page.evaluate(() => window.__outboxProbe.releasePostRead());
      expect(
        await observer.evaluate(() => window.__outboxProbe.list()),
      ).toEqual(before);
      expect(await page.evaluate(() => window.__outboxProbe.sendCalls())).toBe(
        0,
      );
      expect(
        (await (await fetch(`${fixture.url}/history`)).json()).data.items,
      ).toHaveLength(0);
    } finally {
      await cleanupOutbox({
        tabs: [page, observer],
        namespace,
        disposers: [fixture.dispose],
      });
    }
  });
}

test("CHAT-04 E06 sender closes after actual commit; second tab without Locks replays the immutable key once", async ({
  page,
  context,
}) => {
  test.setTimeout(60000);
  const fixture = await startRealtimeFixture();
  const namespace = `insta-chat04-${crypto.randomUUID()}`;
  const second = await context.newPage();
  const committed = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  try {
    await loginOutbox(page, fixture.account);
    await connectOutbox({
      page,
      namespace,
      conversationId: fixture.conversationId,
      withoutLocks: true,
    });
    await connectOutbox({
      page: second,
      namespace,
      conversationId: fixture.conversationId,
      withoutLocks: true,
    });
    const queued = await page.evaluate(() =>
      window.__outboxProbe.enqueue("closed sender synthetic"),
    );
    if (!queued.ok || !queued.record) throw new Error("Enqueue failed");
    await page.route(
      `**/api/conversations/${fixture.conversationId}/messages`,
      async (route) => {
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        committed.resolve();
        await release.promise;
        if (!page.isClosed()) await route.fulfill({ response });
      },
    );
    const pending = page
      .evaluate(() => window.__outboxProbe.drain())
      .catch(() => null);
    await committed.promise;
    const serverMessages = (
      await (await fetch(`${fixture.url}/history`)).json()
    ).data.items;
    expect(serverMessages).toHaveLength(1);
    await page.close();
    release.resolve();
    await pending;
    const retained = await second.evaluate(() => window.__outboxProbe.list());
    expect(retained[0]).toMatchObject({
      key: queued.record.key,
      operationId: queued.record.operationId,
      clientMessageId: queued.record.clientMessageId,
    });
    await second.evaluate(() => window.__outboxProbe.now(10000));
    expect(
      (await second.evaluate(() => window.__outboxProbe.drain())).confirmed,
    ).toBe(1);
    expect(
      (await (await fetch(`${fixture.url}/history`)).json()).data.items,
    ).toHaveLength(1);
    expect(
      await second.evaluate(() => window.__outboxProbe.list()),
    ).toHaveLength(0);
  } finally {
    release.resolve();
    await cleanupOutbox({
      tabs: [page, second],
      namespace,
      disposers: [fixture.dispose],
    });
  }
});

test("CHAT-04 E07 different real cookie owner mid-request rejects late callback and stale expected-owner before Nest", async ({
  page,
}) => {
  test.setTimeout(60000);
  const pair = await startOutboxPair();
  const fixture = pair.primary;
  const other = pair.other;
  const namespace = `insta-chat04-${crypto.randomUUID()}`;
  const committed = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  try {
    await loginOutbox(page, fixture.account);
    const original = await connectOutbox({
      page,
      namespace,
      conversationId: fixture.conversationId,
    });
    const queued = await page.evaluate(() =>
      window.__outboxProbe.enqueue("switched owner synthetic"),
    );
    if (!queued.ok || !queued.record) throw new Error("Enqueue failed");
    await page.route(
      `**/api/conversations/${fixture.conversationId}/messages`,
      async (route) => {
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        committed.resolve();
        await release.promise;
        await route.fulfill({ response });
      },
      { times: 1 },
    );
    const pending = page.evaluate(() => window.__outboxProbe.drain());
    await committed.promise;
    await loginOutbox(page, other.account);
    release.resolve();
    expect((await pending).confirmed).toBe(0);
    expect(
      await page.evaluate(
        (owner) => window.__outboxProbe.list(owner),
        original.ownerId,
      ),
    ).toHaveLength(1);
    const stale = await page.request.post(
      `https://localhost/api/conversations/${fixture.conversationId}/messages`,
      {
        headers: {
          origin: "https://localhost",
          "X-Expected-Owner-ID": original.ownerId,
          "X-Expected-Login-Generation": original.generation,
          "X-Idempotency-Key": queued.record.key,
          "X-Operation-ID": queued.record.operationId,
        },
        data: {
          text: queued.record.text,
          clientMessageId: queued.record.clientMessageId,
        },
      },
    );
    expect(stale.status()).toBe(409);
    expect((await stale.json()).error.code).toBe("ACTOR_CHANGED");
    expect(
      (await (await fetch(`${fixture.url}/history`)).json()).data.items,
    ).toHaveLength(1);
    expect(
      (await (await fetch(`${other.url}/history`)).json()).data.items,
    ).toHaveLength(0);
    const next = await connectOutbox({
      page,
      namespace,
      conversationId: other.conversationId,
    });
    expect(next.ownerId).not.toBe(original.ownerId);
    expect((await page.evaluate(() => window.__outboxProbe.drain())).sent).toBe(
      0,
    );
  } finally {
    release.resolve();
    await cleanupOutbox({
      tabs: [page],
      namespace,
      disposers: [fixture.dispose, other.dispose],
    });
  }
});

test("CHAT-04 exact24h requires selection; unknown manual result cannot restart automatic age cycle, Lock is released", async ({
  page,
}) => {
  test.setTimeout(60000);
  const fixture = await startRealtimeFixture();
  const namespace = `insta-chat04-${crypto.randomUUID()}`;
  try {
    await loginOutbox(page, fixture.account);
    await connectOutbox({
      page,
      namespace,
      conversationId: fixture.conversationId,
    });
    const queued = await page.evaluate(() =>
      window.__outboxProbe.enqueue("aged synthetic"),
    );
    if (!queued.ok || !queued.record) throw new Error("Enqueue failed");
    await page.evaluate(() => window.__outboxProbe.now(86400000));
    expect((await page.evaluate(() => window.__outboxProbe.drain())).sent).toBe(
      0,
    );
    expect(
      await page.evaluate(
        (id) => window.__outboxProbe.confirm([id]),
        queued.record.operationId,
      ),
    ).toBe(1);
    await page.route(
      `**/api/conversations/${fixture.conversationId}/messages`,
      async (route) => {
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        await route.abort("failed");
      },
      { times: 1 },
    );
    expect((await page.evaluate(() => window.__outboxProbe.drain())).sent).toBe(
      1,
    );
    expect(await page.evaluate(() => window.__outboxProbe.canLock())).toBe(
      true,
    );
    expect(
      (await page.evaluate(() => window.__outboxProbe.list()))[0],
    ).toMatchObject({
      key: queued.record.key,
      createdAt: 0,
      needsConfirmation: true,
      attempts: 1,
    });
    await page.evaluate(() => window.__outboxProbe.now(86400001));
    expect((await page.evaluate(() => window.__outboxProbe.drain())).sent).toBe(
      0,
    );
    expect(
      (await (await fetch(`${fixture.url}/history`)).json()).data.items,
    ).toHaveLength(1);
    await page.evaluate(() => window.__outboxProbe.logout());
    expect(await page.evaluate(() => window.__outboxProbe.list())).toHaveLength(
      0,
    );
  } finally {
    await cleanupOutbox({
      tabs: [page],
      namespace,
      disposers: [fixture.dispose],
    });
  }
});

test("CHAT-04 real IndexedDB fault leaves draft unsent, immutable records resist replacement, notices contain no payload", async ({
  page,
  context,
}) => {
  const namespace = `insta-chat04-${crypto.randomUUID()}`;
  const second = await context.newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  try {
    for (const tab of [page, second]) {
      await tab.goto("https://localhost/auth");
      await import("../../fixtures/outbox/install-browser").then(
        ({ installOutboxProbe }) => installOutboxProbe(tab),
      );
      await tab.evaluate((name) => window.__outboxProbe.start(name), namespace);
    }
    expect(
      await page.evaluate(
        (name) => window.__outboxProbe.storageFailure(`${name}-quota`),
        namespace,
      ),
    ).toBe("PERSISTENCE_FAILED");
    expect(await page.evaluate(() => window.__outboxProbe.list())).toHaveLength(
      0,
    );
    expect(pageErrors).toEqual([]);
    const queued = await page.evaluate(() => window.__outboxProbe.enqueue());
    if (!queued.ok || !queued.record) throw new Error("Enqueue failed");
    expect(
      await page.evaluate(
        (record) => window.__outboxProbe.mutate(record),
        queued.record,
      ),
    ).toBe(true);
    expect(
      (await page.evaluate(() => window.__outboxProbe.list()))[0],
    ).toMatchObject({
      key: queued.record.key,
      clientMessageId: queued.record.clientMessageId,
      text: "persisted draft",
      createdAt: 0,
    });
    await second.evaluate(() => window.__outboxProbe.listenNotices());
    await page.evaluate(() => window.__outboxProbe.publishNotice());
    await expect
      .poll(() => second.evaluate(() => window.__outboxProbe.notices()))
      .toEqual([{ kind: "changed" }]);
  } finally {
    await cleanupOutbox({ tabs: [page, second], namespace });
  }
});
test("CHAT-04 native second tab obtains Lock while postresponse cookie read is held; late reauth cannot remove retained record", async ({
  page,
  context,
}) => {
  test.setTimeout(60000);
  const fixture = await startRealtimeFixture();
  const namespace = `insta-chat04-${crypto.randomUUID()}`;
  const second = await context.newPage();
  try {
    await loginOutbox(page, fixture.account);
    const original = await connectOutbox({
      page,
      namespace,
      conversationId: fixture.conversationId,
    });
    await connectOutbox({
      page: second,
      namespace,
      conversationId: fixture.conversationId,
    });
    const queued = await page.evaluate(() =>
      window.__outboxProbe.enqueue("held cookie read synthetic"),
    );
    if (!queued.ok || !queued.record) throw new Error("Enqueue failed");
    await page.evaluate(() => window.__outboxProbe.holdPostRead());
    const pending = page.evaluate(() => window.__outboxProbe.drain());
    await expect
      .poll(() => page.evaluate(() => window.__outboxProbe.postReadStarted()))
      .toBe(true);
    expect(await second.evaluate(() => window.__outboxProbe.canLock())).toBe(
      true,
    );
    await loginOutbox(page, fixture.account);
    await page.evaluate(() => window.__outboxProbe.releasePostRead());
    expect((await pending).confirmed).toBe(0);
    expect(
      (await page.evaluate(() => window.__outboxProbe.list()))[0],
    ).toMatchObject({
      key: queued.record.key,
      clientMessageId: queued.record.clientMessageId,
      lastAuthGeneration: original.generation,
    });
    expect(
      (await (await fetch(`${fixture.url}/history`)).json()).data.items,
    ).toHaveLength(1);
  } finally {
    if (!page.isClosed())
      await page.evaluate(() => window.__outboxProbe.releasePostRead());
    await cleanupOutbox({
      tabs: [page, second],
      namespace,
      disposers: [fixture.dispose],
    });
  }
});

test("CORE I1 native G1 reconcile then G2 cookie before send requires explicit confirmation with same durable identity", async ({
  page,
  context,
}) => {
  test.setTimeout(60000);
  const fixture = await startRealtimeFixture();
  const namespace = `insta-core-generation-${crypto.randomUUID()}`;
  const other = await context.newPage();
  try {
    await loginOutbox(page, fixture.account);
    await connectOutbox({
      page,
      namespace,
      conversationId: fixture.conversationId,
    });
    const queued = await page.evaluate(() =>
      window.__outboxProbe.enqueue("CORE captured G1"),
    );
    if (!queued.ok || !queued.record)
      throw new Error("Expected queued operation");
    await page.evaluate(() => window.__outboxProbe.holdSend());
    const draining = page.evaluate(() => window.__outboxProbe.drain());
    await expect
      .poll(() => page.evaluate(() => window.__outboxProbe.sendStarted()))
      .toBe(true);
    await loginOutbox(other, fixture.account);
    await page.evaluate(() => window.__outboxProbe.releaseSend());
    expect((await draining).confirmed).toBe(0);
    expect(
      (await (await fetch(`${fixture.url}/history`)).json()).data.items,
    ).toHaveLength(0);
    // The post-response actor fence leaves the original record untouched;
    // the next owned drain materializes the existing generation confirmation rule.
    expect((await page.evaluate(() => window.__outboxProbe.drain())).sent).toBe(
      0,
    );
    const before = await page.evaluate(() => window.__outboxProbe.list());
    expect(before[0]).toMatchObject({
      state: "confirmation",
      key: queued.record.key,
      clientMessageId: queued.record.clientMessageId,
    });
    expect(
      await page.evaluate(
        (id) => window.__outboxProbe.confirm([id]),
        queued.record.operationId,
      ),
    ).toBe(1);
    expect(
      (await page.evaluate(() => window.__outboxProbe.drain())).confirmed,
    ).toBe(1);
    const messages = (await (await fetch(`${fixture.url}/history`)).json()).data
      .items;
    expect(messages).toHaveLength(1);
    expect(messages[0].clientMessageId).toBe(queued.record.clientMessageId);
  } finally {
    await cleanupOutbox({
      tabs: [page],
      namespace,
      disposers: [fixture.dispose],
    });
    await other.close();
  }
});
