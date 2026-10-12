import { Result } from "@bloodyowl/boxed";
import { SupportErrorCode } from "@insta/contracts/errors";
import type { Reports } from "../../ports/reports";
import { supportCollectionNames } from "./collections";
import type { Connection, ReplayDocument, ReportDocument } from "./types";
/**
 * Кодирует вид владельца, его идентификатор и ключ запроса в общий ключ replay без
 * смешивания гостевых и пользовательских пространств.
 */
export const replayIdentity = (
  input: Readonly<{
    owner: Readonly<{ kind: string; id: string }>;
    idempotencyKey: string;
  }>,
) => JSON.stringify([input.owner.kind, input.owner.id, input.idempotencyKey]);
/**
 * Проверяет неистёкший replay и fingerprint, возвращая текущее состояние письма.
 * Несовпадение payload даёт conflict, потерянный отчёт — unavailable.
 */
export const readSupportReplay =
  (connection: Connection): Reports["replay"] =>
  async (input) => {
    const supportCollections = supportCollectionNames(connection.namespace);
    const replay = await connection.apiDb
      .collection<ReplayDocument>(supportCollections.replays)
      .findOne({ _id: replayIdentity(input), expiresAt: { $gt: input.now } });
    if (!replay) return Result.Ok(null);
    if (replay.fingerprint !== input.fingerprint)
      return Result.Error(SupportErrorCode.SupportConflict);
    const report = await connection.apiDb
      .collection<ReportDocument>(supportCollections.reports)
      .findOne({ _id: replay.reportId, expiresAt: { $gt: input.now } });
    if (!report) return Result.Error(SupportErrorCode.SupportUnavailable);
    return Result.Ok({
      reportId: report.reportId,
      emailState: report.emailState,
    });
  };
