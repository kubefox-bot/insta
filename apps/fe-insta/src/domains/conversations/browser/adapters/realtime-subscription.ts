import { ConversationSubscriptions } from "./conversation-subscription/registry";
import type { Dependencies } from "./conversation-subscription/types";
/** Создаёт actor-owned subscription registry с domain delivery и canonical recovery. */
export const createConversationSubscription = (dependencies: Dependencies) =>
  new ConversationSubscriptions(dependencies);
