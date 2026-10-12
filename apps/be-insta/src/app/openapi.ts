import { createApplication } from "./bootstrap";
import { createOpenApiDocument } from "./docs/index";
/** Генерирует OpenAPI в offline-композиции и гарантированно закрывает временное Nest-приложение. */
export const exportOpenApi = async () => {
  const app = await createApplication(undefined, { mode: "offline" });
  try {
    return createOpenApiDocument(app);
  } finally {
    await app.close();
  }
};
if (import.meta.main)
  await Bun.write(Bun.stdout, `${JSON.stringify(await exportOpenApi())}\n`);
