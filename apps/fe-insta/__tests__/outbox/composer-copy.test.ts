import { expect, test } from "bun:test";
import { MessageErrorCode, SessionErrorCode } from "@insta/contracts/errors";
import { queueIssueCopy } from "../../src/domains/conversations/components/Composer/lib/issue-copy";
import { messages } from "../../src/lib/i18n/index";

// The operation is wired to Composer's alert; replacing it with a storage-only
// fallback breaks both authentication expectations below.
test("Composer renders its typed queue issue through the tested operation", async () => {
  const source = await Bun.file(
    new URL(
      "../../src/domains/conversations/components/Composer/index.svelte",
      import.meta.url,
    ),
  ).text();
  expect(source).toMatch(
    /<p role="alert">\s*\{queueIssueCopy\(\{\s*issue,\s*copy\s*\}\)\}\s*<\/p>/,
  );
});

test.each(["en", "ru"] as const)(
  "Composer %s keeps auth recovery distinct from storage failure",
  (locale) => {
    const copy = messages[locale];
    expect(queueIssueCopy({ issue: SessionErrorCode.ActorChanged, copy })).toBe(
      copy.auth.actorChanged,
    );
    expect(
      queueIssueCopy({ issue: SessionErrorCode.AuthUnavailable, copy }),
    ).toBe(copy.errors.unavailable);
    expect(queueIssueCopy({ issue: "QUEUE_FULL", copy })).toBe(
      copy.outbox.full,
    );
    expect(
      queueIssueCopy({ issue: MessageErrorCode.InvalidMessage, copy }),
    ).toBe(copy.errors.invalidInput);
    expect(queueIssueCopy({ issue: "PERSISTENCE_FAILED", copy })).toBe(
      copy.outbox.storageFailed,
    );
  },
);
