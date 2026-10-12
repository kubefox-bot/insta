export type { PrivacyDependencies } from "./adapters/http/types";
export type { Preference, Reference } from "./domain/types";
export { allowAnalytics } from "./use-cases/allow-analytics";
export { resolveAnalyticsReference } from "./use-cases/analytics-reference";
export { readPreference } from "./use-cases/read";
export { savePreference } from "./use-cases/save";
