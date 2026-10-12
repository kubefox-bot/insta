import type { messages } from "../../../../lib/i18n/index";
export type Props = Readonly<{
  url: string;
  copy: typeof messages.en;
  issue?: string;
  retake?: () => void;
  publish?: () => void;
}>;
