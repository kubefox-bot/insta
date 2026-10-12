export const storyCollections = {
  uploads: "stories_uploads",
  authors: "stories_authors",
  stories: "stories",
  reconcile: "stories_reconcile",
  outbox: "stories_outbox",
} as const;
export const storyTransactionOptions = {
  readConcern: { level: "snapshot" },
  writeConcern: { w: "majority" },
} as const;
export const duplicateKeyCode = 11000;
