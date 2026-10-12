import { MongoServerError } from "mongodb";
import type { connectDatabase } from "../../../src/lib/database/index";
export const retryPastDeadline = ({
  database,
  expire,
}: Readonly<{
  database: Awaited<ReturnType<typeof connectDatabase>>;
  expire: () => void;
}>) => {
  let attempts = 0;
  return {
    connection: {
      ...database,
      startSession: () => {
        const session = database.startSession();
        const commit = session.commitTransaction.bind(session);
        session.commitTransaction = async () => {
          attempts += 1;
          if (attempts !== 1) return commit();
          await session.abortTransaction();
          expire();
          throw new MongoServerError({
            message: "Synthetic transient commit fault",
            errorLabels: ["TransientTransactionError"],
          });
        };
        return session;
      },
    },
    observed: () => attempts,
  };
};
