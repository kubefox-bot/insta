import type { ButtonProps as CurrentButtonProps } from "@insta/fe-core/ui";
import type { ButtonProps } from "@insta/ui-kit";
import type { Snippet } from "svelte";

type Assert<T extends true> = T;
export type CurrentAndCompatibilityPropsMatch = Assert<
  ButtonProps extends CurrentButtonProps
    ? CurrentButtonProps extends ButtonProps
      ? true
      : false
    : false
>;
export type NativeSubmitAccepted = Assert<
  {
    type: "submit";
    form: string;
    name: string;
    value: string;
    children: Snippet;
  } extends ButtonProps
    ? true
    : false
>;
export type NativeLinkAccepted = Assert<
  {
    href: string;
    target: "_blank";
    rel: string;
    children: Snippet;
  } extends ButtonProps
    ? true
    : false
>;
export type LinkSubmitRejected = Assert<
  { href: string; type: "submit"; children: Snippet } extends ButtonProps
    ? false
    : true
>;
export type LinkFormRejected = Assert<
  { href: string; form: string; children: Snippet } extends ButtonProps
    ? false
    : true
>;
export type LinkActionRejected = Assert<
  { href: string; formaction: string; children: Snippet } extends ButtonProps
    ? false
    : true
>;
