export const browserTargetNames = {
  primary: {
    chrome: "playwright-core-chrome",
    msedge: "playwright-core-msedge",
  },
  smoke: "chrome-edge-auth-chat-smoke",
  protocol: "http3-protocol",
} as const;
export const storiesOnlyPrefixes = [
  "__tests__/e2e/conversations/marks-story-overlay.spec.ts",
  "__tests__/integration/stories/",
  "__tests__/abuse/stories/",
  "__tests__/e2e/stories/",
] as const;
export const isolatedDockerPrefixes = [
  "__tests__/integration/docker/",
  "__tests__/e2e/docker/",
] as const;

export const frontendBrowserFixtures = [
  {
    name: "playwright-frontend-dates",
    path: "apps/fe-insta/__tests__/browser/dates/lifecycle.spec.ts",
    config: "apps/fe-insta/__tests__/browser/dates/playwright.config.ts",
  },
  {
    name: "playwright-frontend-marks",
    path: "apps/fe-insta/__tests__/browser/message-marks.spec.ts",
    config: "apps/fe-insta/__tests__/browser/marks/playwright.config.ts",
  },
] as const;
export const capacityOwnerPath =
  "__tests__/integration/realtime-capacity.host.test.ts";
export const capacityProfileNames = [
  "dedicated1gb capacity fanout 1 aggregate",
  "dedicated1gb capacity fanout 3 aggregate",
  "dedicated1gb capacity conversation 1 aggregate",
  "dedicated1gb capacity conversation 3 aggregate",
] as const;
