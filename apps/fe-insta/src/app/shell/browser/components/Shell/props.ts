import type { Snippet } from "svelte";
import type { Recovery } from "../../../../../domains/auth-continuation/browser/index";
import type { PrivacyBrowser } from "../../../../../domains/privacy/browser/index";
import type {
  FeedRefresh,
  StoryFeed,
  StoryPlayerBrowser,
} from "../../../../../domains/stories/browser/index";
import type {
  AuthBrowser,
  AuthInputTransfer,
} from "../../../../../domains/users/browser/index";
import type { Locale, messages } from "../../../../../lib/i18n/index";
export type Props = Readonly<{
  unreadCount?: number | null;
  conversationWorkspace?: boolean;
  conversationDetail?: boolean;
  onStoryPlayback?: () => boolean;
  children: Snippet;
  stories: Readonly<{
    feed: StoryFeed;
    refresh: FeedRefresh;
    player: StoryPlayerBrowser;
  }> | null;
  storyCreatePath: string;
  onStoryIntent: (
    input: Readonly<{ intentId: string; trigger: HTMLElement | null }>,
  ) => Promise<void>;
  copy: typeof messages.en;
  locale: Locale;
  auth: AuthBrowser;
  inputTransfer: AuthInputTransfer;
  privacy: PrivacyBrowser;
  recovery: Recovery;
}>;
