import type { Locale, messages } from "../../../../lib/i18n/index";
import type { Conversation } from "../../browser/types";
export type Props = Readonly<{
  conversations: readonly Conversation[];
  selectedId: string | null;
  actorId: string;
  usernames?: ReadonlyMap<string, string>;
  copy: typeof messages.en;
  locale: Locale;
}>;
