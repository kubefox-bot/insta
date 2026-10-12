import type { messages } from "../../../../lib/i18n/index";
import type { StoryPlayerBrowser } from "../../browser/types";
import type { RequestConversation } from "./contact/types";
export type Props = Readonly<{
  onPlayback?: () => boolean;
  player: StoryPlayerBrowser;
  copy: Pick<typeof messages.en, "stories" | "common">;
  requestConversation: RequestConversation;
  returnFocus: () => void;
}>;
