import type { Readable } from "svelte/store";
import type { PlayerView } from "../../../browser/types";
import type { FeedGroup } from "../../../domain/feed/types";
export type RequestConversation = (
  input: Readonly<{ authorId: string; isSelected: () => boolean }>,
) => Promise<void>;
export type ContactView = Readonly<{ pending: boolean; failed: boolean }>;
export type Selection = Readonly<{ group: FeedGroup; index: number }>;
export type Owner = {
  selection: Selection | null;
  generation: number;
  disposed: boolean;
};
export type Dependencies = Readonly<{
  selection: Readable<PlayerView>;
  requestConversation: RequestConversation;
  close: () => void;
}>;
