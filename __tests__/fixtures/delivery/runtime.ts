import type { createConversationsDependencies } from "../../../apps/be-insta/src/app/composition/conversations/index";
import {
  connectDragonfly,
  createDeliveryConnection,
  readBrokerIdentity,
} from "../../../apps/be-insta/src/lib/dragonfly/index";
import { readTestApiConfig } from "../environment";
/** Владеет выделенным fixture client; зарегистрированные Streams завершаются перед его закрытием. */
export const connectDeliveryFixture = async () => {
  const resources = new AsyncDisposableStack();
  const auth = await connectDragonfly({
    config: readTestApiConfig().dragonfly,
  });
  const authIdentity = await readBrokerIdentity(auth).finally(() =>
    auth.close(),
  );
  const provider = createDeliveryConnection({
    config: readTestApiConfig().deliveryDragonfly,
    authIdentity,
  });
  resources.defer(() => provider.close());
  return {
    provider,
    /** Передаёт Streams под teardown fixture без изменения chat API. */
    ownChat: (
      chat: Awaited<ReturnType<typeof createConversationsDependencies>>,
    ) => {
      resources.defer(() => chat.realtime.streams.close());
      return chat;
    },
    close: () => resources.disposeAsync(),
  };
};
