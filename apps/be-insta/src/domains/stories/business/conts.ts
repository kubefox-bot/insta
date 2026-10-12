export const storyPublished = {
  operation: "story.publish",
  kind: "story_published",
  code: "STORY_PUBLISHED",
  authority: "server_canonical",
  goal: "story_published",
} as const;
export const storyGoalCatalog = [
  {
    operation: storyPublished.operation,
    authority: storyPublished.authority,
    goal: storyPublished.goal,
    successCodes: [storyPublished.code],
  },
] as const;
