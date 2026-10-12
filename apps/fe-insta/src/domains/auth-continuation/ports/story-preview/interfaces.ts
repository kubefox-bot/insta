import type { Actor } from "../../domain/types";
export type StoryPreview = Readonly<{
  capture: () => Readonly<{ actor: Actor; previewId: string }> | undefined;
  restore: (
    input: Readonly<{ actor: Actor; previewId: string }>,
  ) => "restored" | "missing";
  discard: (input: Readonly<{ previewId: string }>) => void;
}>;
