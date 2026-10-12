import type { StoryRuntimePolicy } from "@insta/contracts/stories";
import type { Locale, messages } from "../../../../lib/i18n/index";
import type { CreationDeparture } from "../../browser/creation-departure/types";
import type { StoryRecorder } from "../../browser/recorder/types";
export type Props = Readonly<{
  locale: Locale;
  policy: StoryRuntimePolicy | null;
  retryPolicy: () => Promise<void>;

  recorder: StoryRecorder;
  departure: CreationDeparture;
  copy: typeof messages.en;
  onCloseAutoFocus?: (event: Event) => void;
}>;
