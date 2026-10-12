import type { StoryRecorder } from "../recorder/types";
export type CreationFocusTarget = Readonly<{
  isConnected: boolean;
  focus: (options: Readonly<{ preventScroll: boolean }>) => void;
}>;
export type CreationSessionDependencies = Readonly<{
  authenticated: () => boolean;
  navigate: (target: string | URL) => Promise<void>;
  replace: (
    target: string,
    state: Readonly<{ storyCreation?: boolean }>,
  ) => void;
  settled: () => Promise<void>;
  recorder: Pick<StoryRecorder, "open" | "close">;
}>;
