import type { PublicPreference, SaveChoice } from "@insta/contracts/privacy";
export type ServerPreferences = Readonly<{
  read: (proof?: string) => Promise<PublicPreference>;
  save: (
    input: SaveChoice,
    proof?: string,
  ) => Promise<
    Readonly<{
      state: PublicPreference;
      contextProof: string;
      expiresAt: number;
    }>
  >;
}>;
export type CookieJar = Readonly<{
  get: (name: string) => string | undefined;
  set: (
    name: string,
    value: string,
    options: Readonly<{
      path: string;
      httpOnly: boolean;
      secure: boolean;
      sameSite: "lax";
      expires: Date;
    }>,
  ) => void;
}>;
