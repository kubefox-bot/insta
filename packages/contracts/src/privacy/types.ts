import type { z } from "zod";
import type { publicPreferenceSchema, saveChoiceSchema } from "./schema";
export type PublicPreference = Readonly<z.infer<typeof publicPreferenceSchema>>;
export type SaveChoice = Readonly<z.infer<typeof saveChoiceSchema>>;
export type Choice = PublicPreference["choice"];
