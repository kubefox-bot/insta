import { RealtimeErrorCode } from "@insta/contracts/realtime";
import { get } from "svelte/store";
import type { ConversationStore } from "../../../domains/conversations/browser/index";
/** Явный retry действует на выбранную историю и восстанавливает transport только при необходимости. */
export const retrySelectedSubscription = ({
  store,
  retry,
  connection,
  reload = () => location.reload(),
}: Readonly<{
  store: Pick<ConversationStore, "view">;
  retry: (id: string) => void;
  connection: Readonly<{ resume: () => void }>;
  reload?: () => void;
}>) => {
  const view = get(store.view);
  if (view.connectionIssue === RealtimeErrorCode.ProtocolUnsupported) {
    reload();
    return;
  }
  const id = view.selectedId;
  if (id) retry(id);
  connection.resume();
};
