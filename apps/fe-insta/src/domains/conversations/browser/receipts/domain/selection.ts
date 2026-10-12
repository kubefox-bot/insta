import type { ConversationActor, ConversationView } from "../../types";
import { isReceiptActor } from "./actor";
/** Возвращает выбранный диалог только для ожидаемого пользователя и поколения, иначе запрещает подтверждения через null. */
export const selectedReceiptConversation = ({
  view,
  actor,
}: Readonly<{
  view: Pick<ConversationView, "actor" | "selectedId">;
  actor: ConversationActor;
}>) =>
  isReceiptActor({ current: view.actor, expected: actor })
    ? view.selectedId
    : null;
