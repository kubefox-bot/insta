import type { Locale, messages } from "../../../../lib/i18n/index";
import type { AuthInputTransfer } from "../../browser/input-transfer/types";
import type { AuthBrowser } from "../../browser/types";
export type Props = Readonly<{
  auth: AuthBrowser;
  transfer?: AuthInputTransfer;
  copy: typeof messages.en;
  locale: Locale;
  stage: "start" | "verify" | "setup";
  expiresAt?: number;
  errorCode?: string;
  action?: string;
  onComplete?: () => void;
  selectedIntent?: string | null;
  onRegistered?: (intentId?: string | null) => void;
}>;
