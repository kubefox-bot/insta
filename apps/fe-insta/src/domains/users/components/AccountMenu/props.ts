import type { messages } from "../../../../lib/i18n/index";
export type Props = Readonly<{
  username: string;
  identity: string;
  copy: typeof messages.en;
  pending?: boolean;
  onLanguage: () => void;
  onPrivacy: () => void;
  onSupport: () => void;
  onLogout: () => void;
}>;
