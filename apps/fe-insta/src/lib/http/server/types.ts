import type { Cookies } from "@sveltejs/kit";
import type { requestLimitModes } from "./conts";

export type RequestLimitOptions = Readonly<{
  mode: (typeof requestLimitModes)[keyof typeof requestLimitModes];
}>;

export type CookieRequest = Readonly<{
  request: Request;
  origin: string;
  cookies: Cookies;
}>;
