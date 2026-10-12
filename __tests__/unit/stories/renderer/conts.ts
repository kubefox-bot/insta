export const rendererPolicy = {
  lifetimeMs: 300_000,
  durationMs: 1_000,
  base: "/contact-renderer/",
  output: ".infra/stories-task6/contact-renderer",
} as const;
export const fixtureAuthors = {
  a: { id: "author-a", username: "RendererAuthorA" },
  b: { id: "author-b", username: "RendererAuthorB" },
} as const;
