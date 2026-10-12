import { z } from "zod";
export const mailFields = {
  id: "ID",
  text: "Text",
  to: "To",
  address: "Address",
  ids: "IDs",
} as const;
export const mailMessageSchema = z.object({
  [mailFields.id]: z.string(),
  [mailFields.text]: z.string(),
});
export const mailSearchSchema = z.object({
  messages: z.array(
    z.object({
      [mailFields.id]: z.string(),
      [mailFields.to]: z.array(z.object({ [mailFields.address]: z.string() })),
    }),
  ),
});
const deleteMessages = async (url: string, ids: ReadonlySet<string>) => {
  if (!ids.size) return;
  const deleted = await fetch(`${url}/api/v1/messages`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ [mailFields.ids]: [...ids] }),
  });
  if (!deleted.ok) throw new Error("Owned Mailpit cleanup failed");
  await deleted.body?.cancel();
};
export const createMailObserver = ({
  url,
  emails,
}: Readonly<{ url: string; emails: ReadonlySet<string> }>) => {
  const ids = new Set<string>();
  const read = async (email: string) => {
    if (!emails.has(email)) throw new Error("Unowned mail query");
    const search = mailSearchSchema.parse(
      await (
        await fetch(
          `${url}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
        )
      ).json(),
    );
    const messages = search.messages.filter((item) =>
      item.To.some((to) => to.Address === email),
    );
    for (const item of messages) ids.add(item.ID);
    return Promise.all(
      messages.map(async (item) =>
        mailMessageSchema.parse(
          await (await fetch(`${url}/api/v1/message/${item.ID}`)).json(),
        ),
      ),
    );
  };
  return {
    read,
    dispose: async () => {
      for (const email of emails) await read(email);
      await deleteMessages(url, ids);
      for (const email of emails)
        if ((await read(email)).length)
          throw new Error("Owned Mailpit cleanup incomplete");
    },
  };
};
