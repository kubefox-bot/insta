import type { ConsentReference } from "@insta/fe-core/observability/analytics";
import type { ClientSession, Document } from "mongodb";
import { originalProjection } from "../../../../lib/observability/analytics/index";
import { supportBusiness } from "../../business/conts";
import type { StoredReport } from "../../domain/types";
import { supportCollectionNames } from "./collections";
import { replayIdentity } from "./replay";
import type { Connection, ReplayDocument, ReportDocument } from "./types";
/**
 * В переданной транзакции заменяет истёкший replay и записывает отчёт с аналитическим
 * outbox. Сессией и разрешением неизвестного commit владеет вызывающий адаптер.
 */
export const commitSupportReport = async ({
  connection,
  input,
  session,
  reference,
}: Readonly<{
  connection: Connection;
  input: StoredReport;
  session: ClientSession;
  reference?: ConsentReference | undefined;
}>) => {
  const collections = supportCollectionNames(connection.namespace);
  const replays = connection.apiDb.collection<ReplayDocument>(
    collections.replays,
  );
  await replays.deleteOne(
    { _id: replayIdentity(input), expiresAt: { $lte: input.createdAt } },
    { session },
  );
  await replays.insertOne(
    {
      _id: replayIdentity(input),
      reportId: input.reportId,
      fingerprint: input.fingerprint,
      expiresAt: input.replayExpiresAt,
    },
    { session },
  );
  await connection.apiDb
    .collection<ReportDocument>(collections.reports)
    .insertOne(
      {
        ...input,
        _id: input.reportId,
        emailState: "pending",
        attempts: 0,
        leaseUntil: 0,
        nextAttemptAt: input.createdAt,
        event: {
          name: supportBusiness.goal,
          operationId: input.operationId,
          reportId: input.reportId,
        },
      },
      { session },
    );
  await connection.apiDb
    .collection<Document & { _id: string }>(collections.outbox)
    .insertOne(
      {
        _id: input.reportId,
        ...supportBusiness,
        type: supportBusiness.goal,
        reportId: input.reportId,
        eventType: supportBusiness.goal,
        operationId: input.operationId,
        analyticsEventId: input.reportId,
        effectId: input.reportId,
        occurredAt: input.createdAt,
        ...originalProjection(reference),
        committedAt: new Date(input.createdAt),
        expiresAt: input.expiresAt,
      },
      { session },
    );
};
