import type { ClientSession, Db } from "mongodb";
import { conversationPolicy } from "../../../domain/policy";
import type { DeliveryJournal } from "../../../ports/delivery/interfaces";
import type { DeliveryRange } from "../../../ports/delivery/types";
import { transactionOptions } from "../conts";
import { readDeliveryHead } from "./head";
import { readRangeSnapshot } from "./range/snapshot";
/** Инициализирует поток и читает retention floor/head/строки в едином snapshot; временная session закрывается после settlement. */
export const readDeliveryRange = async (
  input: Parameters<DeliveryJournal["range"]>[0] &
    Readonly<{ db: Db; startSession: () => ClientSession }>,
): Promise<DeliveryRange> => {
  await readDeliveryHead(input);
  await using resources = new AsyncDisposableStack();
  const session = input.startSession();
  resources.defer(() => session.endSession());
  return await session.withTransaction(
    () => readRangeSnapshot({ ...input, session }),
    {
      ...transactionOptions,
      timeoutMS: conversationPolicy.transactionTimeoutMs,
    },
  );
};
