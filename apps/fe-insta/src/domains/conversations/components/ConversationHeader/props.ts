import type { messages } from "../../../../lib/i18n/index";

export type Props = Readonly<{
  username: string | null;
  identity: string;
  backHref: string;
  copy: typeof messages.en;
}>;
