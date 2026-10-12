export const readStoriesTestConfig = () => ({
  ...Object.fromEntries([
    ["STORIES_MAX_DURATION_MS", Bun.env.STORIES_MAX_DURATION_MS],
  ]),
  ...Object.fromEntries([["STORIES_LIFETIME_MS", Bun.env.STORIES_LIFETIME_MS]]),
  ...Object.fromEntries([["STORIES_MODE", Bun.env.STORIES_MODE]]),
  ...Object.fromEntries([
    ["STORIES_ACTIVE_PROFILE", Bun.env.STORIES_ACTIVE_PROFILE],
  ]),
  ...Object.fromEntries([
    ["STORIES_STORAGE_PROFILES", Bun.env.STORIES_STORAGE_PROFILES],
  ]),
});

export const readStoriesTestCertificate = () => {
  const value = Bun.env.STORIES_TEST_CA;
  if (!value) throw new Error("Stories test certificate required");
  return value;
};
