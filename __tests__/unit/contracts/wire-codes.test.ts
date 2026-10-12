import { expect, test } from "bun:test";
import {
  AuthErrorCode,
  CommonErrorCode,
  ConversationSuccessCode,
  MessageErrorCode,
  RegistrationErrorCode,
  StoryErrorCode,
} from "@insta/contracts/errors";
import { ackSchema } from "@insta/contracts/realtime";
import { conversationFailureSchema } from "../../../apps/be-insta/src/domains/conversations/adapters/http/conversations/dto";
import { historyQuerySchema } from "../../../apps/be-insta/src/domains/conversations/adapters/http/history/dto";
import { messageFailureSchema } from "../../../apps/be-insta/src/domains/conversations/adapters/http/messages/dto";
import { registrationFailureSchema } from "../../../apps/be-insta/src/domains/users/auth/adapters/http/registration.dto";
import { authFailureSchema } from "../../../apps/be-insta/src/domains/users/auth/adapters/http/session.dto";
import { resumeTargetSchema } from "../../../apps/fe-insta/src/domains/auth-continuation/domain/target";
import { historySchema } from "../../../apps/fe-insta/src/domains/conversations/contracts/schema";

const meta = { requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
const failure = (code: string) => ({
  ok: false,
  error: { code, message: "Failure" },
  meta,
});
test("scoped enums serialize the existing protocol identifiers", () => {
  expect(
    JSON.stringify([
      CommonErrorCode.InvalidCursor,
      AuthErrorCode.SessionRevoked,
      RegistrationErrorCode.RegistrationExpired,
      MessageErrorCode.IdempotencyConflict,
      StoryErrorCode.ActiveLimit,
      ConversationSuccessCode.ConversationCreated,
    ]),
  ).toBe(
    '["INVALID_CURSOR","SESSION_REVOKED","REGISTRATION_EXPIRED","IDEMPOTENCY_CONFLICT","ACTIVE_LIMIT","CONVERSATION_CREATED"]',
  );
});
test("endpoint schemas preserve their allowed subsets", () => {
  expect(
    conversationFailureSchema.safeParse(failure(CommonErrorCode.InvalidCursor))
      .success,
  ).toBe(true);
  expect(
    messageFailureSchema.safeParse(failure(CommonErrorCode.InvalidCursor))
      .success,
  ).toBe(true);
  expect(
    authFailureSchema.safeParse(failure(CommonErrorCode.InvalidCursor)).success,
  ).toBe(false);
  expect(
    registrationFailureSchema.safeParse(failure(AuthErrorCode.SessionRevoked))
      .success,
  ).toBe(false);
  expect(
    conversationFailureSchema.safeParse(
      failure(MessageErrorCode.InvalidMessage),
    ).success,
  ).toBe(false);
  expect(
    messageFailureSchema.safeParse(failure(MessageErrorCode.InvalidMessage))
      .success,
  ).toBe(true);
  expect(messageFailureSchema.safeParse(failure("FUTURE_CODE")).success).toBe(
    false,
  );
});
test("WS acknowledgment keeps version, code, message and correlation requirements", () => {
  const raw = {
    version: 1,
    kind: "ack",
    ...failure(AuthErrorCode.SessionRevoked),
  };
  expect<unknown>(ackSchema.parse(raw)).toEqual(raw);
  expect(
    ackSchema.safeParse({
      ...raw,
      error: { code: AuthErrorCode.SessionRevoked },
    }).success,
  ).toBe(false);
  expect(
    ackSchema.safeParse({
      ...raw,
      error: { code: CommonErrorCode.InvalidCursor, message: "Failure" },
    }).success,
  ).toBe(false);
});
test("schema derived types do not freeze values and parsed queries keep defaults and coercion", () => {
  expect(historyQuerySchema.parse({})).toEqual({ limit: 50 });
  expect(historyQuerySchema.parse({ after: "1", limit: "20" })).toEqual({
    after: 1,
    limit: 20,
  });
  expect(
    historyQuerySchema.safeParse({ after: "1", cursor: "cursor" }).success,
  ).toBe(false);
  const history = historySchema.parse({
    items: [],
    baselineCursor: 0,
    watermark: 0,
    pageInfo: { nextCursor: null, hasMore: false },
  });
  expect(Object.isFrozen(history)).toBe(false);
  expect(Object.isFrozen(history.items)).toBe(false);
  expect(
    Object.isFrozen(
      resumeTargetSchema.parse({
        type: "create_story",
        operationId: meta.requestId,
      }),
    ),
  ).toBe(false);
});
