import type { MessageMarkState } from "../../browser/receipts/domain/types";
import type { Props as BubbleProps } from "../MessageBubble/props";
export type Props = Readonly<
  Pick<BubbleProps, "locale" | "copy"> & {
    state?: MessageMarkState;
    createdAt: BubbleProps["message"]["createdAt"];
  }
>;
