import { expect, test } from "bun:test";
import { createPreparedProfile } from "../../scripts/testing/environment/profile";

test("prepared child services override inherited build recipes with exact app and testhost images", () => {
  const images = {
    frontend: `sha256:${"1".repeat(64)}`,
    backend: `sha256:${"2".repeat(64)}`,
    testhost: `sha256:${"3".repeat(64)}`,
  };
  const overlay = createPreparedProfile(images);
  const services: Readonly<
    Record<string, { image?: string; build?: unknown }>
  > = overlay.services;
  for (const [service, expected] of [
    ["fe-insta", images.frontend],
    ["be-insta", images.backend],
    ["testhost", images.testhost],
  ] as const) {
    expect(services[service]?.image).toBe(expected);
    expect(services[service]?.build).toBeNull();
  }
});
