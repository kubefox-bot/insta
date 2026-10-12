import { usernameCharacterClass, usernameLimits } from "./conts";

export const usernameCharacters = new RegExp(`^${usernameCharacterClass}+$`);
export const usernameInputPattern = `${usernameCharacterClass}{${usernameLimits.min},${usernameLimits.max}}`;
