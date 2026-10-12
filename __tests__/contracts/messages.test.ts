import { expect, test } from "bun:test";
import {
  maxTextCodePoints,
  messageInputSchema,
} from "@insta/contracts/messages";
import { sendMessageMutationRequestSchema } from "../../apps/fe-insta/src/lib/api/generated/schemas/sendMessageSchema";

test("send source/generated boundary preserves original Unicode text and rejects whitespace without truncation", () => {
  for (const schema of [messageInputSchema, sendMessageMutationRequestSchema]) {
    expect(
      schema.safeParse({ text: "user D800 \\ literal plus Unicode Ж" }).success,
    ).toBe(true);
    const text = "😀".repeat(maxTextCodePoints);
    expect(schema.safeParse({ text }).success).toBe(true);
    expect(schema.safeParse({ text: `${text}😀` }).success).toBe(false);
    expect(schema.safeParse({ text: " \n\t" }).success).toBe(false);
    expect(
      schema.parse({ text: "  exact\n ", clientMessageId: "local-one" }),
    ).toEqual({ text: "  exact\n ", clientMessageId: "local-one" });
    expect(
      schema.safeParse({ text: "okay", authority: "server_canonical" }).success,
    ).toBe(false);
  }
});
