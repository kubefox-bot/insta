import type { messages } from "../../../../lib/i18n/index";
import type { AuthInputTransfer } from "../../browser/input-transfer/types";
import type { AuthBrowser } from "../../browser/types";
export type Props = Readonly<{
  auth: AuthBrowser;
  transfer?: AuthInputTransfer;
  copy: typeof messages.en;
  errorCode?: string;
  action?: string;
}>;
