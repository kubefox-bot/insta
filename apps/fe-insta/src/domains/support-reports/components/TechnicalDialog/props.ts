import type { messages } from "../../../../lib/i18n/index";
import type { SupportIssue } from "../../browser/types";
export type Props = SupportIssue &
  Readonly<{ copy: typeof messages.en; open: boolean; onClose: () => void }>;
