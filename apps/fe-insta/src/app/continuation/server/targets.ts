import {
  type authorizeContinuationRequest,
  createConversationTargets,
  createStoryTargets,
  createTargets,
} from "../../../domains/auth-continuation/server/index";
import { loadStartedConversation } from "../../../domains/conversations/server/targets/index";
import { resolveStoryTarget } from "../../../domains/stories/server/targets/index";
import { loadSession } from "../../../domains/users/server/index";
/**
 * Связывает цели continuation с публичными Stories и conversations API в контексте текущих
 * cookies и origin; бизнес-решение о допустимости остаётся у целей.
 */
export const createRequestTargets = ({
  auth,
  conversations,
  input,
  available,
}: Readonly<{
  auth: App.Locals["auth"];
  conversations: Pick<App.Locals["conversations"], "start">;
  input: Parameters<typeof authorizeContinuationRequest>[0];
  available: boolean;
}>) => {
  return createTargets({
    stories: createStoryTargets({
      /**
       * Разрешает Story-цель с текущей доступностью функции и ленивым чтением identity запроса.
       */
      resolve: (target) =>
        resolveStoryTarget(target, {
          available: available,
          /**
           * Читает actor через переданный auth API с cookies исходного запроса для проверки Story-цели.
           */
          readIdentity: () =>
            loadSession({
              auth,
              request: input.request,
              origin: input.origin,
              cookies: input.cookies,
            }),
        }),
    }),
    conversations: createConversationTargets({
      /**
       * Вызывает BFF создания диалога от выбранного actor и преобразует ответ в цель continuation;
       * сохраняет origin и cookies исходного запроса.
       */
      start: async ({ recipientId, actor }) =>
        loadStartedConversation(
          await conversations.start({
            request: new Request(input.request.url, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                origin: input.origin,
              },
              body: JSON.stringify({ recipientId }),
            }),
            cookies: input.cookies,
            origin: input.origin,
            owner: actor,
          }),
        ),
    }),
  });
};
