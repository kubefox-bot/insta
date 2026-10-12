import type { Locale, messages } from "../../../../lib/i18n/index";
import type { MessageMarkState } from "../../browser/receipts/domain/types";
export type Props = Readonly<{
  state: MessageMarkState;
  locale: Locale;
  copy: typeof messages.en.messageMarks;
  timestamp?: string;
}>;
