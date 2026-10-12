import type { Actor, StoryTarget } from "../../../domain/types";
export type StoryTargetSource = Readonly<{
  resolve: (
    input: StoryTarget & Readonly<{ actor: Actor }>,
  ) => Promise<StoryTarget | undefined>;
}>;
