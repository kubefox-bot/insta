import type en from "./catalogs/en.json";
export type Locale = "en" | "ru";
export type ConsentMessages = Readonly<typeof en.consent>;
