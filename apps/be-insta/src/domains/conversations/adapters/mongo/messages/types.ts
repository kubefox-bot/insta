import type { ConsentReference } from "@insta/fe-core/observability/analytics";
import type { ClientSession, Db, ObjectId } from "mongodb";
import type { CommitMessageInput } from "../../../ports/commit-message";
export type MessageTransaction = Readonly<{
  db: Db;
  session: ClientSession;
  input: CommitMessageInput;
  messageId: ObjectId;
  reference?: ConsentReference;
  serverNowMs: number;
  retentionMs: number;
}>;

export type PersistMessageInput = MessageTransaction &
  Readonly<{ sequence: number; participantIds: readonly string[] }>;
