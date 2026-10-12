import type { ServerResponse } from "node:http";
import type { NativeResponse } from "../../../../lib/http/index";
export type StoryResponse = NativeResponse &
  Pick<ServerResponse, "once" | "removeListener" | "writableFinished">;
export type StoryNativeRequest = Readonly<{
  method: string;
  path: string;
  socket: Readonly<{ remoteAddress?: string }>;
}>;
export type StoryReadDependencies = Readonly<{
  feed: ReturnType<typeof import("../../use-cases/list-feed").createFeedReader>;
  quotas: Readonly<
    Record<
      "feed" | "playback",
      Readonly<{
        consume: (
          source: string,
        ) => Promise<
          import("@bloodyowl/boxed").Result<
            "allowed" | "limited",
            "unavailable"
          >
        >;
      }>
    >
  >;
}>;
