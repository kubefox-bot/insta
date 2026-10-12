import type { IncomingMessage, ServerResponse } from "node:http";
import type { PrivacyDependencies } from "../../domains/privacy/index";
import { resolveAnalyticsReference } from "../../domains/privacy/index";
import { withAnalyticsReference } from "../../lib/observability/analytics/index";
/** Разрешает ссылку согласия до продолжения HTTP; недоступная optional privacy не блокирует бизнес-запрос. */
export const createAnalyticsContext =
  (privacy: PrivacyDependencies | undefined) =>
  (
    request: IncomingMessage,
    _response: ServerResponse,
    next: (error?: unknown) => void,
  ) => {
    const proof = request.headers["x-consent-context"];
    const resolved = privacy
      ? resolveAnalyticsReference(
          { ...(typeof proof === "string" ? { contextProof: proof } : {}) },
          privacy,
        )
      : Promise.resolve(undefined);
    // An unavailable optional preference leaves business execution intact.
    resolved
      .then(
        (reference) => withAnalyticsReference({ reference, execute: next }),
        () => withAnalyticsReference({ reference: undefined, execute: next }),
      )
      .catch((error) => next(error));
  };
