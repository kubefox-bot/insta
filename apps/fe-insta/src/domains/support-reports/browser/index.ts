export { default as TechnicalDialog } from "../components/TechnicalDialog/index.svelte";
export { openSupportForm, submitSupport } from "./adapters/http/submit";
export { createSupportBrowser } from "./create";
export type { SupportIssue, SupportReceipt } from "./types";
