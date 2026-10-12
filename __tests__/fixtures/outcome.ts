import type { Result } from "@bloodyowl/boxed";
export const requireSuccess = <Value, Error>(
  result: Result<Value, Error>,
): Value => {
  if (result.isError()) throw new Error("Expected a successful outcome");
  return result.get();
};
export const requireFailure = <Value, Error>(
  result: Result<Value, Error>,
): Error => {
  if (result.isOk()) throw new Error("Expected a failed outcome");
  return result.getError();
};
