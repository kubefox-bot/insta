import { ApiBoundaryConfigError } from "./configuration-error";
import { isInside } from "./source-paths";
import type { BrowserTransportConfiguration } from "./types";
/**
 * Отклоняет browser transport, совпадающий с server file/transport либо лежащий в server/generated root; конфигурацию не изменяет.
 */
export const validateBrowserTransports = ({
  paths,
  serverFiles,
  serverRoots,
  generatedRoot,
  serverTransports,
}: BrowserTransportConfiguration) => {
  for (const path of paths) {
    const protectedFile =
      serverTransports.includes(path) || serverFiles.includes(path);
    const protectedRoot =
      serverRoots.some((root) => isInside(path, root)) ||
      isInside(path, generatedRoot);
    if (protectedFile || protectedRoot)
      throw new ApiBoundaryConfigError(
        `browserTransportFiles: ${path} must remain outside the server/generated boundary`,
      );
  }
};
