import type { Icon } from "@insta/fe-core/ui";
import type { ComponentProps } from "svelte";
import type { MessageMarkState } from "../../browser/receipts/domain/types";
export const markIcons = {
  waiting: "clock",
  sent: "check",
  delivered: "double-check",
  read: "double-check",
  error: "error",
} as const satisfies Record<
  MessageMarkState["kind"],
  ComponentProps<typeof Icon>["name"]
>;
