import { messageInputSchema } from "@insta/contracts/messages";
/**
 * Проверяет текст общей схемой messages, сохраняя единый wire/domain лимит и правила
 * содержимого.
 */
export const validMessageText = (text: string) =>
  messageInputSchema.shape.text.safeParse(text).success;
