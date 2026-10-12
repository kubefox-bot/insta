import type { Fixture } from "./types";
export const ownedAuthorIds = async (fixture: Fixture) => {
  const users = await fixture.native.db
    .collection("users")
    .find({ emailKey: { $regex: `^${fixture.native.runId}-` } })
    .toArray();
  return users.map((user) => user._id.toHexString());
};
