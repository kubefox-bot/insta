export const ALLOWED_TYPES = [
  "feat",
  "fix",
  "chore",
  "docs",
  "refactor",
  "test",
  "build",
  "ci",
] as const;
export const MIN_DESCRIPTION_CHARACTERS = 8;
export const MIN_DESCRIPTION_WORDS = 2;
export const SUBJECT_SEPARATOR = ": ";
export const bootstrapCommitSubject = "feat: init";
export const GENERIC_DESCRIPTIONS: readonly string[] = [
  "wip",
  "tmp",
  "test",
  "update",
  "updates",
  "changes",
  "misc",
  "fix",
  "stuff",
  "work",
  "default",
  "short",
  "fix things",
];
