import type { StoryRuntimePolicy } from "@insta/contracts/stories";
import type { Locale, messages } from "../../../../lib/i18n/index";
import type { CameraView } from "../../browser/recorder/types";
export type Props = Readonly<{
  locale: Locale;
  policy: StoryRuntimePolicy;

  camera: CameraView;
  cameraDisabled?: boolean;
  copy: typeof messages.en;
  enable: () => void;
  start: () => void;
  stop: () => void;
}>;
