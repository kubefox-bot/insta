import type { ConversationView } from "../../../domains/conversations/browser/index";
import { conversationConnectionStates } from "../../../domains/conversations/browser/index";
import type { ConnectionState } from "../../../lib/realtime/index";
import { connectionStates } from "../../../lib/realtime/index";
export const connectionStatus = {
  [connectionStates.idle]: conversationConnectionStates.connecting,
  [connectionStates.connecting]: conversationConnectionStates.connecting,
  [connectionStates.connected]: conversationConnectionStates.connected,
  [connectionStates.degraded]: conversationConnectionStates.connecting,
  [connectionStates.protocolError]: conversationConnectionStates.error,
  [connectionStates.exhausted]: conversationConnectionStates.error,
  [connectionStates.unauthorized]: conversationConnectionStates.error,
  [connectionStates.disposed]: conversationConnectionStates.error,
} as const satisfies Record<
  ConnectionState["kind"],
  ConversationView["connection"]
>;
