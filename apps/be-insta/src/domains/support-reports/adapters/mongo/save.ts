import { Result } from "@bloodyowl/boxed";
import { SupportErrorCode } from "@insta/contracts/errors";
import { readOriginalReference } from "../../../../lib/observability/analytics/index";
import type { Receipt, SupportError } from "../../domain/types";
import type { Reports } from "../../ports/reports";
import { commitSupportReport } from "./commit";
import { readSupportReplay } from "./replay";
import type { Connection } from "./types";
/**
 * Сохраняет отчёт, replay и outbox в своей сессии. При неизвестном commit читает scoped
 * replay вместо повторной записи; всегда завершает сессию.
 */
export const saveSupportReport =
  (connection: Connection): Reports["save"] =>
  async (input) => {
    const reference = readOriginalReference(connection.analyticsReference);
    const session = connection.startSession();
    try {
      await session.withTransaction(() =>
        commitSupportReport({ connection, input, session, reference }),
      );
      return Result.Ok({ reportId: input.reportId, emailState: "pending" });
    } catch {
      // Resolve unknown commit using the same scoped replay; never create a second owner.
      const replay = await readSupportReplay(connection)({
        ...input,
        now: input.createdAt,
      }).catch(
        (): Result<Receipt | null, SupportError> =>
          Result.Error(SupportErrorCode.SupportUnavailable),
      );
      if (replay.isError()) return Result.Error(replay.getError());
      const receipt = replay.get();
      return receipt
        ? Result.Ok(receipt)
        : Result.Error(SupportErrorCode.SupportUnavailable);
    } finally {
      await session.endSession();
    }
  };
