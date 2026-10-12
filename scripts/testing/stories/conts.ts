export const storiesAcceptance = {
  storageImage:
    "rustfs/rustfs:1.0.1@sha256:1803faef57627e2d9c2e7d89d655d712ddded5389040054987163043fecb6a3c",
  storageVolume: "stories-storage:/data",
  sourceLabel: "insta.source-tree",
  manifestLabel: "insta.source-manifest",
} as const;
export const storiesEnvironmentKeys = {
  mode: "STORIES_MODE",
  maxDurationMs: "STORIES_MAX_DURATION_MS",
  lifetimeMs: "STORIES_LIFETIME_MS",
  activeProfile: "STORIES_ACTIVE_PROFILE",
  profiles: "STORIES_STORAGE_PROFILES",
} as const;
