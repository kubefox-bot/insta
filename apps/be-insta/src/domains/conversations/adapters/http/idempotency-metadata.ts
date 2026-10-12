import { z } from "zod";
import type { SwaggerBodySchema } from "../../../../lib/http/index";

// Preserve the published header projection; the full validator also has minLength.
/**
 * Строит опубликованную OpenAPI-проекцию header из Zod без minLength; полный runtime
 * validator остаётся более строгим.
 */
export const createIdempotencyHeaderSchema = (
  schema: z.ZodOptional<z.ZodString>,
): SwaggerBodySchema => {
  const { type, maxLength, pattern } = z.toJSONSchema(schema.unwrap());
  return { type, maxLength, pattern } as SwaggerBodySchema;
};
