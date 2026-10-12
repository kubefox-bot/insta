import type { ConsentReference } from "@insta/fe-core/observability/analytics";
import { createConversationAnalyticsOutboxes } from "../../../domains/conversations/server/index";
import type { PrivacyDependencies } from "../../../domains/privacy/index";
import { allowAnalytics } from "../../../domains/privacy/index";
import { createStoryAnalyticsOutbox } from "../../../domains/stories/server/index";
import { createSupportAnalyticsOutbox } from "../../../domains/support-reports/server/index";
import { createAuthAnalyticsOutbox } from "../../../domains/users/server/index";
import type { connectDatabase } from "../../../lib/database/index";
/** Собирает canonical outbox разных capabilities и подключает актуальную privacy-проверку на границе композиции. */
export const createAnalyticsDependencies = ({
  database,
  privacy,
}: Readonly<{
  database: Awaited<ReturnType<typeof connectDatabase>>;
  privacy: PrivacyDependencies;
}>) => ({
  outboxes: [
    createStoryAnalyticsOutbox(database.apiDb),
    createAuthAnalyticsOutbox(database.apiDb),
    createSupportAnalyticsOutbox({ db: database.apiDb }),
    ...createConversationAnalyticsOutboxes(database.apiDb),
  ],
  /** Перепроверяет ссылку согласия через privacy перед необязательной analytics-доставкой. */
  permission: (reference: ConsentReference) =>
    allowAnalytics({ reference }, privacy),
});
