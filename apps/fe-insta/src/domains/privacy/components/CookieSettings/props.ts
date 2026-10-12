import type { ConsentMessages } from "../../../../lib/i18n/index";
import type { PrivacyBrowser } from "../../browser/types";
export type Props = Readonly<{
  privacy: PrivacyBrowser;
  messages: ConsentMessages;
  open: boolean;
  closeLabel: string;
  onClose: () => void;
}>;
