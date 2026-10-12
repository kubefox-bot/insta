import { HttpStatus } from "@nestjs/common";
import {
  documentationEntryAliases,
  documentationEntryMethods,
  documentationPath,
} from "./conts";

/** Перенаправляет GET/HEAD aliases документации на единый путь, сохраняя исходную query string. */
export const redirectDocumentationEntry = (
  request: Readonly<{ method: string; path: string; originalUrl: string }>,
  response: { redirect: (status: number, url: string) => void },
  next: () => void,
) => {
  const isEntryAlias =
    request.path === documentationEntryAliases.slash ||
    request.path === documentationEntryAliases.index;
  const isRead = documentationEntryMethods.some(
    (method) => method === request.method,
  );
  if (!isEntryAlias || !isRead) {
    next();
    return;
  }
  const queryStart = request.originalUrl.indexOf("?");
  const query = queryStart < 0 ? "" : request.originalUrl.slice(queryStart);
  response.redirect(
    HttpStatus.TEMPORARY_REDIRECT,
    `${documentationPath}${query}`,
  );
};
