import type { Result } from "@bloodyowl/boxed";
import type { messages } from "../../../../lib/i18n/index";
import type { QueueError } from "../../browser/outbox/domain/types";
export type Props = Readonly<{
  copy: typeof messages.en;
  disabled?: boolean;
  text: string;
  change: (text: string) => void;
  send: (text: string) => Promise<Result<unknown, QueueError>>;
}>;
