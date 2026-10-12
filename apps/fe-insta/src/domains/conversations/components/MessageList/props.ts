import type { Locale, messages } from "../../../../lib/i18n/index";
import type { ScrollBinding } from "../../browser/scroll/types";
import type { Message } from "../../browser/types";
export type Props = Readonly<{
  isForeground?: boolean;
  scroll?: ScrollBinding;
  items: readonly Message[];
  actorId: string;
  copy: typeof messages.en;
  locale: Locale;
  unavailable?: boolean;
  earlier: boolean;
  loading: boolean;
  loadEarlier: () => Promise<void>;
  readVisible?: (messageIds: readonly string[]) => void;
}>;
