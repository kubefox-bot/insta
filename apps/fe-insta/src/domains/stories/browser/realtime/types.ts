import type { createConnection } from "../../../../lib/realtime/index";
export type StorySubscriptionDependencies = Readonly<{
  command: ReturnType<typeof createConnection>["command"];
  refresh: () => Promise<"applied" | "retry-later" | "stale">;
  uuid: () => string;
  report: () => void;
}>;
