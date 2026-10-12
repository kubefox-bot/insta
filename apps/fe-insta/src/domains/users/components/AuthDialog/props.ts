import type { Locale, messages } from "../../../../lib/i18n/index";
import type { AuthInputTransfer } from "../../browser/input-transfer/types";
import type { AuthBrowser } from "../../browser/types";
export type Props = Readonly<{
  auth: AuthBrowser;
  inputTransfer: AuthInputTransfer;
  copy: typeof messages.en;
  open: boolean;
  description?: string;
  mode: "login" | "register";
  locale: Locale;
  registration: Readonly<{
    stage: "start" | "verify" | "setup";
    expiresAt?: number;
  }>;
  onRegistered: (intentId?: string | null) => void;
  onModeChange: (mode: "login" | "register") => void;
  errorCode?: string;
  selectedIntent?: string | null;
  onClose: () => void;
}>;
