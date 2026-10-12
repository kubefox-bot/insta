import type {
  ConversationTarget,
  ResumeTarget,
  StoryTarget,
} from "../domain/types";
export type ResumeSelection = Readonly<{
  intentId: string;
  isSelected?: () => boolean;
}>;
export type ResumeDependencies = Readonly<{
  resolveResume: (intentId: string) => Promise<ResumeTarget | undefined>;
  currentGeneration: () => string | undefined;
  onRejected?: (intentId: string) => void;
  onResumed?: (
    input: Readonly<{ intentId: string; target: ResumeTarget }>,
  ) => void;
  openStory: (target: StoryTarget) => Promise<void> | void;
  openConversation: (target: ConversationTarget) => Promise<void> | void;
}>;
