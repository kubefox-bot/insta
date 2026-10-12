import { consentPolicyVersion } from "@insta/contracts/privacy";
import type { RequestEvent } from "@sveltejs/kit";
import {
  loadPreference,
  readConsentProof,
  savePreference,
} from "../../../domains/privacy/server/index";
import { createSessionSnapshotReader } from "../../../domains/users/server/index";
import type { RequestContext } from "../../../lib/api/server/index";
import { createContinuationRequest } from "../../continuation/server/index.ts";
import { createConversationsRequest } from "../../conversations/server/index.ts";
import { readTrustedClientSource } from "../../infrastructure/server/client-source/index.ts";
import { checkReadiness } from "../../infrastructure/server/index.ts";
import { createPrivacyRequest } from "../../privacy/server/index.ts";
import { createStoryRequests } from "../../stories/server/index";
import { createSupportRequest } from "../../support-reports/server/index.ts";
import { createAuthRequest } from "../../users/server/index.ts";
/**
 * Наполняет request locals публичными BFF операциями и consent-контекстом, связывая их с
 * cookies и correlation. Health получает necessary preference без загрузки пользовательских
 * настроек.
 */
export const prepareRequest = async ({
  event,
  correlation,
}: Readonly<{ event: RequestEvent; correlation: RequestContext }>) => {
  /**
   * Предоставляет в locals проверку готовности инфраструктуры с correlation текущего запроса.
   */
  event.locals.checkReadiness = () => checkReadiness({ context: correlation });
  /**
   * Разрешает источник текущего HTTP-запроса по непосредственному peer и forwarded header через
   * доверенный proxy resolver.
   */
  const source = () =>
    readTrustedClientSource({
      peer: event.getClientAddress(),
      forwardedFor: event.request.headers.get("x-forwarded-for"),
    });
  event.locals.telemetrySource = source;
  const privacyRequest = createPrivacyRequest(correlation, source);
  const consentProof = await readConsentProof({
    cookies: event.cookies,
    key: privacyRequest.key,
  });
  const context = { ...correlation, ...(consentProof ? { consentProof } : {}) };
  event.locals.stories = createStoryRequests({ context, source });
  event.locals.auth = createAuthRequest({ context, source });
  event.locals.getSessionView = createSessionSnapshotReader({
    auth: event.locals.auth,
    request: event.request,
    cookies: event.cookies,
    origin: event.url.origin,
  });
  event.locals.conversations = createConversationsRequest({
    context,
    source,
  });
  event.locals.support = createSupportRequest({
    context,
    source,
    auth: event.locals.auth,
  });
  event.locals.continuation = createContinuationRequest({
    auth: event.locals.auth,
    conversations: event.locals.conversations,
  });
  /**
   * Передаёт сохранение consent владельцу privacy с текущими cookies и origin; backend получает
   * исходную корреляцию, без повторного использования старого consent proof.
   */
  event.locals.savePrivacy = ({ request, origin }) =>
    savePreference({
      request,
      origin,
      cookies: event.cookies,
      ...createPrivacyRequest(correlation, source),
    });
  /**
   * Загружает preference для cookies текущего запроса через подготовленный privacy backend.
   */
  event.locals.readPrivacy = () =>
    loadPreference({
      cookies: event.cookies,
      ...privacyRequest,
    });
  event.locals.privacy = event.url.pathname.startsWith("/api/health/")
    ? { choice: "necessary", policyVersion: consentPolicyVersion, revision: 0 }
    : await event.locals.readPrivacy();
};
