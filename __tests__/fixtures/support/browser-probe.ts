import { z } from "zod";
import { connectDatabase } from "../../../apps/be-insta/src/lib/database/index";
import { waitUntil } from "../barrier";
import { readTestApiConfig } from "../environment";
import { mailMessageSchema, mailSearchSchema } from "../registration/mailpit";

const comment = z
  .string()
  .regex(/^support-e12-[a-f0-9-]{36}$/)
  .parse(process.argv[3]);
const action = z.enum(["inspect", "cleanup"]).parse(process.argv[2]);
const config = readTestApiConfig();
const connection = await connectDatabase({ config: config.mongo });
try {
  const reports = connection.apiDb.collection<{
    _id: string;
    reportId: string;
    comment: string;
    emailState: string;
  }>("support_reports");
  const owned = () => reports.find({ comment }).toArray();
  if (action === "inspect")
    await waitUntil({
      timeoutMs: 10000,
      check: async () => {
        const rows = await owned();
        return rows.length === 1 && rows[0]?.emailState === "accepted";
      },
    });
  const rows = await owned();
  const ids = rows.map((row) => row.reportId);
  const mails: string[] = [];
  for (const report of rows) {
    const search = mailSearchSchema.parse(
      await (
        await fetch(
          `${config.mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:${config.supportRecipient} ${report.reportId}`)}`,
        )
      ).json(),
    );
    for (const item of search.messages) {
      const message = mailMessageSchema.parse(
        await (
          await fetch(`${config.mailpitUrl}/api/v1/message/${item.ID}`)
        ).json(),
      );
      if (
        message.Text.includes(comment) &&
        message.Text.includes(report.reportId)
      )
        mails.push(item.ID);
    }
  }
  const canonical = await connection.apiDb
    .collection("support_outbox")
    .countDocuments({
      reportId: { $in: ids },
      eventType: "support_report_submitted",
    });
  if (action === "inspect")
    process.stdout.write(
      JSON.stringify({
        reports: rows.length,
        canonical,
        emailState: rows[0]?.emailState,
        mailpitMessages: mails.length,
      }),
    );
  if (action === "cleanup") {
    if (mails.length) {
      const response = await fetch(`${config.mailpitUrl}/api/v1/messages`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries([["IDs", mails]])),
      });
      if (!response.ok) throw new Error("Owned support mail cleanup failed");
      await response.body?.cancel();
    }
    await connection.apiDb
      .collection("support_replays")
      .deleteMany({ reportId: { $in: ids } });
    await connection.apiDb
      .collection("support_outbox")
      .deleteMany({ reportId: { $in: ids } });
    await reports.deleteMany({ comment, reportId: { $in: ids } });
    if (await reports.countDocuments({ comment }))
      throw new Error("Owned browser report cleanup failed");
    process.stdout.write(
      JSON.stringify({
        reportsRemaining: 0,
        deletedReports: ids.length,
        deletedMail: mails.length,
      }),
    );
  }
} finally {
  await connection.close();
}
