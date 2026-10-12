import { describe, expect, it } from "bun:test";
import {
  parseCommitMessage,
  validateCommitMessage,
} from "@insta/fe-core/git/commit-message";

describe("portable commit subjects", () => {
  for (const subject of [
    "feat: init",
    "feat: add conversation directory",
    "fix(auth): сохранить выбор пользователя",
    "chore: install local hooks",
    "docs: explain commit policy",
    "refactor: extract message parser",
    "test: cover failed commits",
    "build: compile shared tooling",
    "ci: check module boundaries",
    "fix: abcd efg",
  ] as const) {
    it(`accepts ${subject}`, () => {
      expect(validateCommitMessage(subject)).toEqual([]);
    });
  }

  for (const [subject, code] of [
    ["fix: init", "description-short"],
    ["add conversation directory", "commit-format"],
    [": описание изменений", "commit-type-missing"],
    ["other: add conversation directory", "commit-type"],
    ["fix(): update message parsing", "scope-format"],
    ["fix: ", "description-missing"],
    ["fix:    ", "description-missing"],
    ["fix: a b", "description-short"],
    ["fix: abc def", "description-short"],
    ["fix: description", "description-words"],
    ["fix: update", "description-generic"],
    ["chore: fix things", "description-generic"],
  ] as const) {
    it(`rejects ${JSON.stringify(subject)} with ${code}`, () => {
      expect(
        validateCommitMessage(subject).map((issue) => issue.code),
      ).toContain(code);
    });
  }

  it("parses a scoped subject independently of Git and files", () => {
    expect(parseCommitMessage("fix(auth): preserve selected intent")).toEqual({
      value: "fix(auth): preserve selected intent",
      hasConventionalFormat: true,
      prefix: "fix(auth)",
      type: "fix",
      scope: "auth",
      description: "preserve selected intent",
    });
  });
});
