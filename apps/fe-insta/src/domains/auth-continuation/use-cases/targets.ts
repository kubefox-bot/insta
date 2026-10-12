import type { Targets } from "../ports/targets";
/**
 * Соединяет владельцев целей разговоров и Stories в порт продолжения без переноса их правил в
 * общий сценарий.
 */
export const createTargets = ({
  conversations,
  stories,
}: Readonly<{ conversations: Targets; stories: Targets }>): Targets => ({
  /**
   * Направляет intent соответствующему владельцу цели по его типу; неизвестный внутренний
   * вариант не получает fallback.
   */
  resolve: (input) => {
    switch (input.intent.type) {
      case "open_conversation":
      case "compose_message":
        return conversations.resolve(input);
      case "create_story":
      case "resume_story":
        return stories.resolve(input);
      default: {
        const exhaustive: never = input.intent.type;
        throw new Error(String(exhaustive));
      }
    }
  },
});
