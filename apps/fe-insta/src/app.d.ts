import type { PublicPreference } from "@insta/contracts/privacy";

declare global {
  namespace App {
    interface PageState {
      storyCreation?: boolean;
    }
    interface Locals {
      stories: ReturnType<
        typeof import("./app/stories/server/index.ts").createStoryRequests
      >;
      conversations: ReturnType<
        typeof import("./app/conversations/server/index.ts").createConversationsRequest
      >;
      support: ReturnType<
        typeof import("./app/support-reports/server/index.ts").createSupportRequest
      >;
      continuation: ReturnType<
        typeof import("./app/continuation/server/index.ts").createContinuationRequest
      >;
      auth: ReturnType<
        typeof import("./app/users/server/index.ts").createAuthRequest
      >;
      getSessionView: ReturnType<
        typeof import("./domains/users/server/index").createSessionSnapshotReader
      >;
      privacy: PublicPreference;
      readPrivacy: () => Promise<PublicPreference>;
      savePrivacy: (
        input: Readonly<{ request: Request; origin: string }>,
      ) => Promise<Response>;
      correlation?: Readonly<{ requestId: string; operationId?: string }>;
      checkReadiness: () => Promise<boolean>;
      telemetrySource: () => Promise<string>;
    }
  }
}
