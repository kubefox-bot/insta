import { expect, test } from "bun:test";
import { z } from "zod";

const registration =
  "UI04 registration uses client navigation/server stages and discards previous account draft with zero automatic messages";
const peer =
  "UI04 explicit logout in a second tab discards first-tab live draft before same-owner login";
for (const entry of [
  ...[
    {
      suite: "conversations/delivery",
      name: "actual UI recovers lost last-event without another message or history polling",
      timeoutMs: 90000,
    },
    {
      suite: "conversations/delivery-state",
      name: "last receipt event retries without reconnect, next event or history polling",
      timeoutMs: 90000,
    },
    {
      suite: "conversations/delivery-restart",
      name: "actual gateway restart preserves the current dialogue and converges once after offline replay",
      timeoutMs: 120000,
    },
  ].flatMap((owner) => [
    { ...owner, mode: "newContext setup", events: ["chat"], cleanup: false },
    {
      ...owner,
      mode: "newPage setup",
      events: ["peer", "chat"],
      cleanup: false,
    },
    { ...owner, mode: "peer cleanup", events: ["peer", "chat"], cleanup: true },
  ]),

  {
    suite: "auth/ui-continuation",
    name: registration,
    mode: "second setup",
    events: ["chat"],
    cleanup: false,
    timeoutMs: 50000,
  },
  {
    suite: "auth/ui-continuation",
    name: registration,
    mode: "first auth cleanup",
    events: ["auth", "chat"],
    cleanup: true,
    timeoutMs: 50000,
  },
  {
    suite: "auth/ui-continuation",
    name: peer,
    mode: "newPage setup",
    events: ["chat"],
    cleanup: false,
    timeoutMs: 50000,
  },
  {
    suite: "auth/ui-continuation",
    name: peer,
    mode: "first page cleanup",
    events: ["page", "chat"],
    cleanup: true,
    timeoutMs: 50000,
  },
  ...[
    "discovery_empty_error_retry_and_home_native_actions",
    "new_messages_and_older_page_preserve_reader_scroll",
    "loaded_directory_names_are_private_and_delayed_results_do_not_cross_owner",
  ].map((name) => ({
    suite: "conversations/layout",
    name,
    mode: "first routes cleanup",
    events: ["routes", "chat"],
    cleanup: true,
    timeoutMs:
      name === "new_messages_and_older_page_preserve_reader_scroll"
        ? 120000
        : 90000,
  })),
  ...[
    "pending_logout_and_late_S1_receipt_preserve_S2_header_and_private_body",
    "unavailable_session_header_does_not_claim_guest_or_successful_logout",
  ].map((name) => ({
    suite: "shell/header",
    name,
    mode: "first routes cleanup",
    events: ["routes", "auth"],
    cleanup: true,
    timeoutMs: 50000,
  })),
  {
    suite: "auth/ui-continuation",
    name: "UI04 real expiry preserves same-owner draft through modal reauth and safe Continue; Send commits once",
    mode: "single cleanup",
    events: ["chat"],
    cleanup: true,
    timeoutMs: 50000,
  },
  {
    suite: "conversations/layout",
    name: "desktop_thread_precedes_right_sidebar",
    mode: "single cleanup",
    events: ["chat"],
    cleanup: true,
    timeoutMs: 90000,
  },
  {
    suite: "shell/header",
    name: "member_avatar_menu_owns_language_privacy_support_and_logout",
    mode: "single cleanup",
    events: ["chat"],
    cleanup: true,
    timeoutMs: 50000,
  },
]) {
  test(`actual ${entry.suite} ${entry.mode} retains all acquired owners: ${entry.name}`, async () => {
    const child = Bun.spawn(
      [
        process.execPath,
        new URL("./consumer-probe.ts", import.meta.url).pathname,
        entry.suite,
        entry.name,
        entry.mode,
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    const [output, errors, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (code !== 0) throw new Error(errors);
    const receipt = z
      .object({
        events: z.array(z.string()),
        original: z.boolean(),
        cleanup: z.boolean(),
        timeoutMs: z.number(),
      })
      .parse(JSON.parse(output));
    expect(receipt).toEqual({
      events: entry.events,
      original: true,
      cleanup: entry.cleanup,
      timeoutMs: entry.timeoutMs,
    });
  });
}
