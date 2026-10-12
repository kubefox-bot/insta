import type { messages } from "../../../../lib/i18n/index";
export type Props = Readonly<{
  copy: typeof messages.en;
  search: (
    input: Readonly<{ q: string; signal: AbortSignal }>,
  ) => Promise<readonly Readonly<{ id: string; username: string }>[]>;
  open: (recipientId: string) => Promise<void>;
  onResults?: (users: Awaited<ReturnType<Props["search"]>>) => void;
}>;
