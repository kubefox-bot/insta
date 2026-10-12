import type { Snippet } from "svelte";
import type { messages } from "../../../../lib/i18n/index";
import type { FeedView } from "../../browser/types";
import type { FeedGroup } from "../../domain/feed/types";
export type Props = Readonly<{
  view: FeedView;
  onCreate: (event: MouseEvent) => void;
  onOpen: (
    input: Readonly<{ group: FeedGroup; trigger: HTMLButtonElement }>,
  ) => void;
  onRefresh: () => void;
  onLoadMore: () => void;
  createAction: Snippet<[Snippet]>;
  copy: Pick<typeof messages.en, "stories" | "common">;
}>;
