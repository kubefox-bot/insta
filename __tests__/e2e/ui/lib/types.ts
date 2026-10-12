import type {
  BrowserContext,
  BrowserContextOptions,
  Page,
  TestInfo,
} from "@playwright/test";
import type { startChatFixture } from "../../../fixtures/chat05/browser";

export type CaptureMode = "native" | "hydrated";
export type CaptureInput = Readonly<{
  page: Page;
  info: TestInfo;
  name: string;
  mode?: CaptureMode;
}>;

export type UiFixtures = {
  chatFixture: Awaited<ReturnType<typeof startChatFixture>>;
  secondaryContext: BrowserContext;
  secondaryContextOptions: BrowserContextOptions;
};
