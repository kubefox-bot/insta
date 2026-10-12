import { z } from "zod";
import type { createBffEnvironment } from "../bff-session/environment";

export const expireOwnedSession = async ({
  fixture,
  actorId,
  request,
}: Readonly<{
  fixture: Awaited<ReturnType<typeof createBffEnvironment>>;
  actorId: string;
  request: Request;
}>) => {
  if (request.method !== "POST") return new Response(null, { status: 405 });
  const { generation } = z
    .object({ generation: z.uuid() })
    .parse(await request.json());
  const owned = await fixture.native.db.collection("users").findOne({
    emailKey: { $regex: `^${fixture.native.runId}-` },
    $expr: { $eq: [{ $toString: "$_id" }, actorId] },
  });
  if (!owned) throw new Error("Expiry requires a fixture-owned account");
  const expiredAtMs = Date.now() - 1;
  const result = await fixture.web.webDb
    .collection("bff_sessions")
    .updateOne(
      { "user.id": actorId, backendSessionId: generation },
      { $set: { expiresAt: expiredAtMs, absoluteExpiresAt: expiredAtMs } },
    );
  return Response.json({ expired: result.modifiedCount });
};
