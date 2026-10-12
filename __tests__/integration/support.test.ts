import { expect, test } from "bun:test";
import { sendEmail } from "../../apps/be-insta/src/domains/support-reports/use-cases/send-email";
import { submitReport } from "../../apps/be-insta/src/domains/support-reports/use-cases/submit";
import { createSupportEnvironment } from "../fixtures/support/environment";

test("A21 support Mongo commit owns one report/pending mail/canonical event; repeated key and wrong fingerprint", async () => {
  const f = await createSupportEnvironment();
  try {
    const input = await f.input();
    const [a, b] = await Promise.all([
      submitReport(input, f.dependencies),
      submitReport(
        { ...input, operationId: crypto.randomUUID() },
        f.dependencies,
      ),
    ]);
    expect(a.isOk()).toBe(true);
    expect(b).toEqual(a);
    if (a.isError()) throw new Error(a.getError());
    expect(await f.db.collection(f.collections.reports).countDocuments()).toBe(
      1,
    );
    expect(
      await f.db
        .collection(f.collections.outbox)
        .countDocuments({ eventType: "support_report_submitted" }),
    ).toBe(1);
    expect(
      (
        await submitReport({ ...input, comment: "changed" }, f.dependencies)
      ).toJSON(),
    ).toMatchObject({ tag: "Error", error: "SUPPORT_CONFLICT" });
    expect(
      (
        await submitReport({ ...input, guestContext: "wrong" }, f.dependencies)
      ).toJSON(),
    ).toMatchObject({ tag: "Error", error: "SUPPORT_CONTEXT_INVALID" });
  } finally {
    await f.dispose();
  }
});
test("A21 persisted support mail is SMTP accepted in real Mailpit without header injection; streams exposes task id only", async () => {
  const f = await createSupportEnvironment();
  try {
    const input = await f.input();
    const result = await submitReport(input, f.dependencies);
    if (result.isError()) throw new Error(result.getError());
    const queued = await f.dependencies.jobs.next();
    expect(queued?.reportId).toBe(result.get().reportId);
    const raw = JSON.stringify(
      await f.broker.send("XRANGE", [
        `auth:${f.generation}:${f.runId}:mail`,
        "-",
        "+",
      ]),
    );
    expect(raw.includes(input.comment)).toBe(false);
    expect(
      await sendEmail(
        { reportId: result.get().reportId },
        { ...f.dependencies, email: f.email },
      ),
    ).toBe("accepted");
    const mail = await f.mail.read(f.recipient);
    expect(mail).toHaveLength(1);
    expect(mail[0]?.Text.includes(input.comment)).toBe(true);
    expect(
      (
        await f.db
          .collection(f.collections.reports)
          .findOne({ reportId: result.get().reportId })
      )?.emailState,
    ).toBe("accepted");
    const full = await (
      await fetch(`${readMailUrl()}/api/v1/message/${mail[0]?.ID}`)
    ).json();
    expect(full.To).toEqual([
      Object.fromEntries([
        ["Name", ""],
        ["Address", f.recipient],
      ]),
    ]);
    expect(full.HTML).toContain("&lt;script&gt;");
    expect(full.HTML).not.toContain("<script>");
  } finally {
    await f.dispose();
  }
});

import { readTestApiConfig } from "../fixtures/environment";

const readMailUrl = () => readTestApiConfig().mailpitUrl;
