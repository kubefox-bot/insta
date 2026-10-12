import type { ConsentReference } from "@insta/fe-core/observability/analytics";
/** Читает исходную ссылку согласия; ошибка необязательного reader трактуется как отсутствие разрешения для analytics. */
export const readOriginalReference = (
  read: (() => ConsentReference | undefined) | undefined,
): ConsentReference | undefined => {
  try {
    return read?.();
  } catch {
    return undefined;
  }
};
