import type { createBffEnvironment } from "../environment";

export const cleanupBrowserBindings = async ({
  fixture,
  emails,
}: Readonly<{
  fixture: Awaited<ReturnType<typeof createBffEnvironment>>;
  emails: readonly string[];
}>) => {
  const users = await fixture.native.db
    .collection("users")
    .find({ emailKey: { $in: [...emails] } })
    .toArray();
  const ids = users.map((user) => user._id.toHexString());
  await fixture.web.webDb
    .collection("bff_sessions")
    .deleteMany({ "user.id": { $in: ids } });
  if (
    await fixture.web.webDb
      .collection("bff_sessions")
      .countDocuments({ "user.id": { $in: ids } })
  )
    throw new Error("Browser binding cleanup incomplete");
};
