import type { messages } from "../../../../lib/i18n/index";
import type { DepartureView } from "../../browser/creation-departure/types";
export type Props = Readonly<{
  view: DepartureView;
  copy: typeof messages.en;
  cancel: () => void;
  confirm: () => void;
}>;
