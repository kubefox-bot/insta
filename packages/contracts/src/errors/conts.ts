import {
  AuthErrorCode,
  RegistrationErrorCode,
  SessionErrorCode,
} from "../auth/index";
import { ContinuationErrorCode } from "../continuation/index";
import { DirectoryErrorCode } from "../directory/index";
import { CommonErrorCode } from "../http/index";
import {
  ConversationErrorCode,
  MessageErrorCode,
  ReceiptErrorCode,
} from "../messages/index";
import { PrivacyErrorCode } from "../privacy/index";
import { RealtimeErrorCode } from "../realtime/index";
import { StoryErrorCode } from "../stories/index";
import { SupportErrorCode } from "../support/index";

export const codes = {
  auth: AuthErrorCode,
  registration: RegistrationErrorCode,
  session: SessionErrorCode,
  directory: DirectoryErrorCode,
  conversations: ConversationErrorCode,
  messages: MessageErrorCode,
  receipts: ReceiptErrorCode,
  realtime: RealtimeErrorCode,
  stories: StoryErrorCode,
  continuation: ContinuationErrorCode,
  privacy: PrivacyErrorCode,
  support: SupportErrorCode,
  common: CommonErrorCode,
} as const;
