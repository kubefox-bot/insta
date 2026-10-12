import { supportPolicy } from "../../domain/conts";
import type { Reports } from "../../ports/reports";
import { supportCollectionNames } from "./collections";
import type { Connection, ReportDocument } from "./types";
/**
 * Отмечает исчерпанные попытки и удаляет ограниченную пачку истёкших отчётов без
 * активного lease вместе с replay/outbox. Свою транзакционную сессию закрывает даже при
 * ошибке.
 */
export const cleanupSupportReports =
  (connection: Connection): Reports["cleanup"] =>
  async (now) => {
    const collections = supportCollectionNames(connection.namespace);
    const reports = connection.apiDb.collection<ReportDocument>(
      collections.reports,
    );
    await reports.updateMany(
      {
        emailState: "pending",
        attempts: { $gte: supportPolicy.attempts },
        leaseUntil: { $lte: now },
      },
      { $set: { emailState: "failed" } },
    );
    const expired = (
      await reports
        .find(
          { expiresAt: { $lte: now }, leaseUntil: { $lte: now } },
          { projection: { _id: 1 } },
        )
        .limit(supportPolicy.recoveryBatch)
        .toArray()
    ).map((value) => value._id);
    if (expired.length) {
      const session = connection.startSession();
      try {
        await session.withTransaction(async () => {
          await reports.deleteMany(
            {
              _id: { $in: expired },
              expiresAt: { $lte: now },
              leaseUntil: { $lte: now },
            },
            { session },
          );
          await connection.apiDb
            .collection<{ _id: string }>(collections.outbox)
            .deleteMany({ _id: { $in: expired } }, { session });
          await connection.apiDb
            .collection(collections.replays)
            .deleteMany({ reportId: { $in: expired } }, { session });
        });
      } finally {
        await session.endSession();
      }
    }
    await connection.apiDb
      .collection(collections.replays)
      .deleteMany({ expiresAt: { $lte: now } });
  };
