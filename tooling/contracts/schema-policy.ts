import { z } from "zod";
import { ignoredAnnotationKeys } from "./conts";

const schemaShape = z.looseObject({
  type: z.union([z.string(), z.array(z.string())]).optional(),
  additionalProperties: z.unknown().optional(),
  properties: z.record(z.string(), z.unknown()).default({}),
  items: z.unknown().optional(),
  oneOf: z.array(z.unknown()).default([]),
  anyOf: z.array(z.unknown()).default([]),
  allOf: z.array(z.unknown()).default([]),
});
const assertSchemaClosed = (input: unknown): void => {
  if (typeof input === "boolean" || input === undefined) return;
  const schema = schemaShape.parse(input);
  const types =
    typeof schema.type === "string" ? [schema.type] : (schema.type ?? []);
  if (types.includes("object") && schema.additionalProperties !== false)
    throw new Error(
      "Unsupported open wire object: add a faithful Kubb generation fixture and writer before publishing this DTO",
    );
  for (const value of Object.values(schema.properties))
    assertSchemaClosed(value);
  assertSchemaClosed(schema.items);
  for (const value of [...schema.oneOf, ...schema.anyOf, ...schema.allOf])
    assertSchemaClosed(value);
};
const visitDocumentSchemas = (
  value: z.infer<ReturnType<typeof z.json>>,
): void => {
  if (!value || typeof value !== "object") return;
  const entries = Array.isArray(value)
    ? Array.from(value.entries())
    : Object.entries(value);
  for (const [key, child] of entries) {
    if (key === "schema") {
      assertSchemaClosed(child);
      continue;
    }
    if (ignoredAnnotationKeys.includes(String(key))) continue;
    visitDocumentSchemas(child);
  }
};
export const assertClosedWireObjects = (document: unknown): void => {
  const root = z
    .looseObject({
      components: z
        .looseObject({ schemas: z.record(z.string(), z.unknown()).optional() })
        .optional(),
      paths: z.record(z.string(), z.json()).optional(),
    })
    .parse(document);
  for (const schema of Object.values(root.components?.schemas ?? {}))
    assertSchemaClosed(schema);
  for (const path of Object.values(root.paths ?? {}))
    visitDocumentSchemas(path);
};
