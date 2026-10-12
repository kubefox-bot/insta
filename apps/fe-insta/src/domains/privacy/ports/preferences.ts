import type { PublicPreference, SaveChoice } from "@insta/contracts/privacy";
export type Preferences = Readonly<{
  read: () => Promise<PublicPreference>;
  save: (input: SaveChoice) => Promise<PublicPreference>;
}>;
