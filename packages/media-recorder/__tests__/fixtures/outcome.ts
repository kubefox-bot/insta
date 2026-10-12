import type { Result } from "@bloodyowl/boxed";
export const value = <T, E>(result: Result<T, E>): T => {
  if (result.isError())
    throw new Error(`Unexpected error: ${JSON.stringify(result.getError())}`);
  return result.get();
};
export const failure = <T, E>(result: Result<T, E>): E => {
  if (result.isOk()) throw new Error("Expected error outcome");
  return result.getError();
};
