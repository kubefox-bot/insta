import type { Props as IconOptions } from "../../icons/props";
import type { MessengerIconName } from "../../icons/types";

export type Props = Readonly<{
  name: MessengerIconName | "chat" | "cookie" | "logo" | "en" | "ru";
}> &
  IconOptions;
