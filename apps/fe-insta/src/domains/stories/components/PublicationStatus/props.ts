import type { messages } from "../../../../lib/i18n/index";
import type { RecorderView } from "../../browser/recorder/types";
export type Props = Readonly<{
  view: Extract<RecorderView, { kind: "uploading" | "published" | "checking" }>;
  copy: typeof messages.en;
  check: () => void;
  retry: () => void;
}>;
