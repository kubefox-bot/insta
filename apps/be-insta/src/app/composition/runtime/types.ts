import type { ClientSourceReader } from "@insta/contracts/http";
import type { PrivacyDependencies } from "../../../domains/privacy/index";
import type { SupportDependencies } from "../../../domains/support-reports/index";
import type { Readiness } from "../../health/readiness/index";
import type { AnalyticsDependencies } from "../analytics/index";
import type { createConversationsDependencies } from "../conversations/index";
import type { createStoriesRuntime } from "../stories/index";
import type {
  createDirectoryDependencies,
  createUsersDependencies,
} from "../users/index";
export type RuntimeDependencies = Readiness & {
  readonly stories?: Awaited<ReturnType<typeof createStoriesRuntime>>;
  readonly directory?: ReturnType<
    typeof createDirectoryDependencies
  >["directory"];
  readonly realtimeOrigin?: string;
  readonly chat?: Awaited<ReturnType<typeof createConversationsDependencies>>;
  readonly support?: SupportDependencies;
  readonly users?: Omit<
    Awaited<ReturnType<typeof createUsersDependencies>>,
    "registration" | "tickets"
  > &
    Readonly<{
      tickets?: Awaited<ReturnType<typeof createUsersDependencies>>["tickets"];
      registration?: Awaited<
        ReturnType<typeof createUsersDependencies>
      >["registration"];
    }>;
  readonly privacy?: PrivacyDependencies;
  readonly analytics?: AnalyticsDependencies;
  readonly clientSource?: ClientSourceReader;
  readonly stopWorkers?: () => Promise<void>;
  readonly close: () => Promise<void>;
};
