import { MongoServerError } from "mongodb";
import type { connectDatabase } from "../../../src/lib/database/index";
export const loseFirstCommitReply = (
  database: Awaited<ReturnType<typeof connectDatabase>>,
) => {
  let lostReply = false;
  let committedCalls = 0;
  return {
    connection: {
      ...database,
      startSession: () => {
        const session = database.startSession();
        const commit = session.commitTransaction.bind(session);
        session.commitTransaction = async () => {
          await commit();
          committedCalls += 1;
          if (lostReply) return;
          lostReply = true;
          throw new MongoServerError({
            message: "Synthetic commit reply loss",
            errorLabels: ["UnknownTransactionCommitResult"],
          });
        };
        return session;
      },
    },
    observed: () => ({ lostReply, committedCalls }),
  };
};
