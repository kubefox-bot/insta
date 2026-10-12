import { expect, test } from "bun:test";
import { Result } from "@bloodyowl/boxed";
import { SupportErrorCode } from "@insta/contracts/errors";
import { dispatchSupportMail } from "../../../apps/be-insta/src/domains/support-reports/use-cases/dispatch";
import { sendEmail } from "../../../apps/be-insta/src/domains/support-reports/use-cases/send-email";
import { submitReport } from "../../../apps/be-insta/src/domains/support-reports/use-cases/submit";
import { createSupportEnvironment } from "../../fixtures/support/environment";

test("A21 save failure sends zero SMTP; unknown commit retries original scope and stays one canonical event", async () => {
  const f = await createSupportEnvironment();
  try {
    let smtpCalls = 0;
    const input = await f.input();
    const seed = await submitReport(
      {
        ...input,
        idempotencyKey: crypto.randomUUID(),
        comment: "synthetic collision seed",
      },
      f.dependencies,
    );
    if (seed.isError()) throw new Error(seed.getError());
    await f.db
      .collection(f.collections.reports)
      .updateOne(
        { reportId: seed.get().reportId },
        { $set: { emailState: "accepted" } },
      );
    const rejected = await submitReport(input, {
      ...f.dependencies,
      uuid: () => seed.get().reportId,
    });
    expect(rejected.isError()).toBe(true);
    expect(
      await f.db
        .collection(f.collections.replays)
        .countDocuments({ fingerprint: f.dependencies.fingerprint(input) }),
    ).toBe(0);
    await dispatchSupportMail(
      {
        ...f.dependencies,
        email: {
          send: async (job) => {
            smtpCalls++;
            return f.email.send(job);
          },
        },
      },
      new AbortController().signal,
    );
    expect(smtpCalls).toBe(0);
    await f.db
      .collection(f.collections.reports)
      .deleteMany({ reportId: seed.get().reportId });
    await f.db
      .collection(f.collections.replays)
      .deleteMany({ reportId: seed.get().reportId });
    await f.db
      .collection(f.collections.outbox)
      .deleteMany({ reportId: seed.get().reportId });
    const committed = await submitReport(input, {
      ...f.dependencies,
      reports: {
        ...f.dependencies.reports,
        save: async (value) => {
          await f.dependencies.reports.save(value);
          throw new Error("lost response");
        },
      },
    });
    expect(committed.isError()).toBe(true);
    const retry = await submitReport(input, f.dependencies);
    if (retry.isError()) throw new Error(retry.getError());
    await sendEmail(
      { reportId: retry.get().reportId },
      {
        ...f.dependencies,
        email: {
          send: async () => {
            smtpCalls++;
            return "accepted";
          },
        },
      },
    );
    expect(smtpCalls).toBe(1);
    expect(await f.db.collection(f.collections.outbox).countDocuments()).toBe(
      1,
    );
  } finally {
    await f.dispose();
  }
});
test("A21 SMTP accepted then response lost is honest pending and bounded to five attempts; no delivered claim", async () => {
  const f = await createSupportEnvironment();
  try {
    const result = await submitReport(await f.input(), f.dependencies);
    if (result.isError()) throw new Error(result.getError());
    let calls = 0;
    const email = {
      send: async (job: Parameters<typeof f.email.send>[0]) => {
        calls++;
        await f.email.send(job);
        throw new Error("SMTP acceptance response lost");
      },
    };
    for (let attempt = 0; attempt < 5; attempt++) {
      await sendEmail(
        { reportId: result.get().reportId },
        { ...f.dependencies, email },
      );
      f.advance(20000);
    }
    expect(calls).toBe(5);
    expect(
      (
        await f.db
          .collection(f.collections.reports)
          .findOne({ reportId: result.get().reportId })
      )?.emailState,
    ).toBe("failed");
    expect((await f.mail.read(f.recipient)).length).toBeGreaterThan(0);
    expect(
      await sendEmail(
        { reportId: result.get().reportId },
        { ...f.dependencies, email },
      ),
    ).toBe("idle");
    expect(calls).toBe(5);
  } finally {
    await f.dispose();
  }
});
test("A21 streams loss recovers durable Mongo pending; retention racing claim stops new sends and removes owned data", async () => {
  const f = await createSupportEnvironment();
  try {
    const result = await submitReport(await f.input(), f.dependencies);
    if (result.isError()) throw new Error(result.getError());
    await f.broker.del(`auth:${f.generation}:${f.runId}:mail`);
    expect(await f.dependencies.jobs.next()).toBeNull();
    expect(await f.dependencies.reports.recover(f.clock())).toEqual([
      result.get().reportId,
    ]);
    f.advance(2592000000);
    const [claimed] = await Promise.all([
      f.dependencies.reports.claim({
        reportId: result.get().reportId,
        leaseId: crypto.randomUUID(),
        now: f.clock(),
      }),
      f.dependencies.reports.cleanup(f.clock()),
    ]);
    expect(claimed).toBeNull();
    expect(await f.db.collection(f.collections.reports).countDocuments()).toBe(
      0,
    );
    expect(await f.db.collection(f.collections.outbox).countDocuments()).toBe(
      0,
    );
    expect(await f.db.collection(f.collections.replays).countDocuments()).toBe(
      0,
    );
  } finally {
    await f.dispose();
  }
});
test("A22 support five per owner, twenty per IP across fresh contexts, context issuance twenty; unavailable limiter rejects before save", async () => {
  const f = await createSupportEnvironment();
  try {
    for (let i = 0; i < 6; i++) {
      const result = await f.dependencies.limits.consume({
        kind: "owner",
        subject: "same",
      });
      expect(result.toJSON()).toMatchObject({
        tag: "Ok",
        value: i < 5 ? "allowed" : "limited",
      });
    }
    for (const kind of ["ip", "context"] as const)
      for (let i = 0; i < 21; i++) {
        const result = await f.dependencies.limits.consume({
          kind,
          subject: "same",
        });
        expect(result.toJSON()).toMatchObject({
          tag: "Ok",
          value: i < 20 ? "allowed" : "limited",
        });
      }
    const input = await f.input();
    const result = await submitReport(input, {
      ...f.dependencies,
      limits: {
        consume: async () => Result.Error(SupportErrorCode.SupportUnavailable),
      },
    });
    expect(result.isError()).toBe(true);
    expect(await f.db.collection(f.collections.reports).countDocuments()).toBe(
      0,
    );
  } finally {
    await f.dispose();
  }
});
