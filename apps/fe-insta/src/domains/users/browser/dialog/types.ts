import type { AuthInputTransfer } from "../input-transfer/types";
export type AuthMode = "login" | "register";
export type AuthLinkActivation = Readonly<
  Pick<
    MouseEvent,
    | "defaultPrevented"
    | "button"
    | "metaKey"
    | "ctrlKey"
    | "shiftKey"
    | "altKey"
  >
>;
export type AuthLink = Readonly<{
  href: string;
  target: string;
  download: boolean;
}>;
export type AuthDialogDependencies = Readonly<{
  inputTransfer: Pick<AuthInputTransfer, "clear">;
  chooseAuthentication: (
    input: Readonly<{ mode: AuthMode; intentId?: string | null }>,
  ) => void;
}>;
