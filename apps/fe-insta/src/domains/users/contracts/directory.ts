import { z } from "zod";
export const directorySchema = z.strictObject({
  items: z.array(
    z.strictObject({
      id: z.string().regex(/^[a-f0-9]{24}$/),
      username: z.string(),
    }),
  ),
});
