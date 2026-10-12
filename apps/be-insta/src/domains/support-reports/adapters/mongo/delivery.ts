import { supportPolicy } from "../../domain/conts";
import { emailStateAfterAttempt } from "../../domain/email-state";
import type { Reports } from "../../ports/reports";
import { supportCollectionNames } from "./collections";
import { storedReportSchema } from "./schema";
import type { Connection, ReportDocument } from "./types";
/**
 * Связывает восстановление и lease-доставку с коллекцией отчётов заимствованного
 * Mongo-соединения.
 */
export const createSupportDelivery = (
  connection: Connection,
): Pick<Reports, "recover" | "claim" | "finish"> => {
  const reports = connection.apiDb.collection<ReportDocument>(
    supportCollectionNames(connection.namespace).reports,
  );
  return {
    /**
     * Выбирает ограниченную пачку неистёкших pending отчётов с наступившим retry и
     * свободным lease; список ещё не означает захват.
     */
    recover: async (now) =>
      (
        await reports
          .find(
            {
              emailState: "pending",
              expiresAt: { $gt: now },
              nextAttemptAt: { $lte: now },
              leaseUntil: { $lte: now },
              attempts: { $lt: supportPolicy.attempts },
            },
            { projection: { _id: 1 } },
          )
          .limit(supportPolicy.recoveryBatch)
          .toArray()
      ).map((value) => value._id),
    /**
     * Атомарно захватывает доступный отчёт и увеличивает попытки; при проигранной гонке
     * возвращает null, сохранённый документ валидирует.
     */
    claim: async ({ reportId, now, leaseId }) => {
      const report = await reports.findOneAndUpdate(
        {
          _id: reportId,
          emailState: "pending",
          expiresAt: { $gt: now },
          nextAttemptAt: { $lte: now },
          leaseUntil: { $lte: now },
          attempts: { $lt: supportPolicy.attempts },
        },
        {
          $set: { leaseId, leaseUntil: now + supportPolicy.leaseMs },
          $inc: { attempts: 1 },
        },
        { returnDocument: "after" },
      );
      return report ? storedReportSchema.parse(report) : null;
    },
    /**
     * Фиксирует SMTP-исход только для своего lease, снимает захват и назначает
     * экспоненциальный retry; исчерпанные попытки переводит в failed.
     */
    finish: async ({ job, state, now }) => {
      await reports.updateOne(
        { _id: job.reportId, leaseId: job.leaseId },
        {
          $set: {
            emailState: emailStateAfterAttempt({
              state,
              attempts: job.attempts,
            }),
            leaseUntil: 0,
            nextAttemptAt:
              now + supportPolicy.retryMs * 2 ** (job.attempts - 1),
          },
          $unset: { leaseId: "" },
        },
      );
    },
  };
};
