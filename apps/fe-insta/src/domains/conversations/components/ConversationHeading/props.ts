import type { messages } from "../../../../lib/i18n/index";
export type Props = Readonly<{
  count: number | null | undefined;
  copy: typeof messages.en;
}>;
