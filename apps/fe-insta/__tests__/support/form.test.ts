import { expect, test } from "bun:test";
import { Result } from "@bloodyowl/boxed";
import { get } from "svelte/store";
import type { SupportFormTransport } from "../../src/domains/support-reports/browser/ports/interfaces";
import { createSupportForm } from "../../src/domains/support-reports/browser/use-cases/form";
import type {
  SupportFailure,
  SupportSubmission,
} from "../../src/domains/support-reports/domain/types";

const draft = {
  comment: "original",
  issue: { errorCode: "TECHNICAL_PROBLEM", originalRequestId: "request" },
};
const receipt = {
  reportId: crypto.randomUUID(),
  emailState: "pending" as const,
};
const setup = (submitSupport: SupportFormTransport["submitSupport"]) => {
  const scopes: AbortSignal[] = [];
  const form = createSupportForm({
    uuid: () => crypto.randomUUID(),
    transport: {
      openSupportForm: async (signal) => {
        scopes.push(signal);
        return crypto.randomUUID();
      },
      submitSupport,
    },
  });
  return { form, scopes };
};

test("unknown retries preserve frozen payload and key even when draft and issue change", async () => {
  const sent: SupportSubmission[] = [];
  const { form } = setup(async (payload) => {
    sent.push(payload);
    return sent.length === 1 ? Result.Error("unknown") : Result.Ok(receipt);
  });
  await form.ensureContext();
  await form.submit(draft);
  expect(get(form.view).uncertain).toBe(true);
  await form.submit({ comment: "edited", issue: { errorCode: "NEW_ISSUE" } });
  expect(sent).toHaveLength(2);
  expect(Object.isFrozen(sent[0])).toBe(true);
  expect(sent[1]).toBe(sent[0]);
  expect(sent[1]?.comment).toBe("original");
  expect(get(form.view).attempt.kind).toBe("saved");
  await form.submit(draft);
  expect(sent).toHaveLength(2);
  form.dispose();
});

for (const failure of ["contextInvalid", "actorChanged"] as const) {
  test(`${failure} requires a new scope before another submission`, async () => {
    const sent: SupportSubmission[] = [];
    const { form, scopes } = setup(async (payload) => {
      sent.push(payload);
      return Result.Error(failure);
    });
    await form.ensureContext();
    await form.submit(draft);
    expect(get(form.view).canSubmit).toBe(false);
    await form.submit(draft);
    await form.ensureContext();
    expect(sent).toHaveLength(1);
    expect(scopes).toHaveLength(1);
    await form.newReport();
    await form.submit(draft);
    expect(scopes).toHaveLength(2);
    expect(sent[1]?.scopeId).not.toBe(sent[0]?.scopeId);
    expect(sent[1]?.idempotencyKey).not.toBe(sent[0]?.idempotencyKey);
    form.dispose();
  });
}

test("new report retains uncertainty across reports and later known failures", async () => {
  let failure: SupportFailure = "unknown";
  const { form } = setup(async () => Result.Error(failure));
  await form.ensureContext();
  await form.submit(draft);
  failure = "rateLimited";
  await form.submit(draft);
  expect(get(form.view).uncertain).toBe(true);
  await form.newReport();
  expect(get(form.view).attempt.kind).toBe("idle");
  expect(get(form.view).uncertain).toBe(true);
  await form.submit(draft);
  await form.newReport();
  expect(get(form.view).uncertain).toBe(true);
  form.dispose();
});

test("sending blocks concurrent submit and new report while saved blocks submit", async () => {
  const pending =
    Promise.withResolvers<Result<typeof receipt, SupportFailure>>();
  let sends = 0;
  const { form, scopes } = setup(async () => {
    sends++;
    return pending.promise;
  });
  await form.ensureContext();
  const sending = form.submit(draft);
  await form.submit(draft);
  await form.newReport();
  expect(sends).toBe(1);
  expect(scopes).toHaveLength(1);
  expect(get(form.view).attempt.kind).toBe("sending");
  pending.resolve(Result.Ok(receipt));
  await sending;
  await form.submit(draft);
  expect(sends).toBe(1);
  form.dispose();
});

test("dispose aborts context and ignores late completion without minting a key or starting requests", async () => {
  const pending = Promise.withResolvers<string>();
  const signals: AbortSignal[] = [];
  let keys = 0;
  let sends = 0;
  const form = createSupportForm({
    uuid: () => {
      keys++;
      return crypto.randomUUID();
    },
    transport: {
      openSupportForm: async (signal) => {
        signals.push(signal);
        return pending.promise;
      },
      submitSupport: async () => {
        sends++;
        return Result.Ok(receipt);
      },
    },
  });
  const opening = form.ensureContext();
  await form.ensureContext();
  expect(signals).toHaveLength(1);
  form.dispose();
  const disposedView = get(form.view);
  expect(signals[0]?.aborted).toBe(true);
  pending.resolve(crypto.randomUUID());
  await opening;
  await form.newReport();
  await form.ensureContext();
  await form.submit(draft);
  expect(get(form.view)).toBe(disposedView);
  expect(keys).toBe(0);
  expect(sends).toBe(0);
  expect(signals).toHaveLength(1);
});

test("late saved or unknown responses cannot update disposed form", async () => {
  for (const result of [Result.Ok(receipt), Result.Error("unknown" as const)]) {
    const pending =
      Promise.withResolvers<Result<typeof receipt, SupportFailure>>();
    const signals: AbortSignal[] = [];
    const { form } = setup(async (_payload, signal) => {
      signals.push(signal);
      return pending.promise;
    });
    await form.ensureContext();
    const sending = form.submit(draft);
    form.dispose();
    const disposedView = get(form.view);
    expect(signals[0]?.aborted).toBe(true);
    pending.resolve(result);
    await sending;
    expect(get(form.view)).toBe(disposedView);
  }
});

test("context failure permits explicit retry, rejected submission becomes unknown", async () => {
  let contexts = 0;
  const form = createSupportForm({
    uuid: () => crypto.randomUUID(),
    transport: {
      openSupportForm: async () => {
        contexts++;
        if (contexts === 1) throw new Error("offline");
        return crypto.randomUUID();
      },
      submitSupport: async () => {
        throw new Error("connection lost after save");
      },
    },
  });
  await form.ensureContext();
  expect(get(form.view).scope.kind).toBe("unavailable");
  await form.ensureContext();
  await form.submit(draft);
  expect(get(form.view).attempt).toMatchObject({
    kind: "failed",
    failure: "unknown",
    uncertain: true,
  });
  form.dispose();
});
