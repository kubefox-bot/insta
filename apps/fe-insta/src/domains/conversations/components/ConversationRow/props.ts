import type { messages } from "../../../../lib/i18n/index";
import type { Conversation } from "../../browser/types";

export type Props = Readonly<{
  activity?: string | null;
  conversation: Conversation;
  selected: boolean;
  actorId: string;
  username: string | null;
  copy: typeof messages.en;
}>;
