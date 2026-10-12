import { z } from "zod";
export const resumeTargetSchema = z.union([
  z.strictObject({
    type: z.enum(["open_conversation", "compose_message"]),
    conversationId: z.string().regex(/^[A-Za-z0-9_-]+$/),
  }),
  z.strictObject({
    type: z.enum(["create_story", "resume_story"]),
    operationId: z.uuid(),
  }),
]);
