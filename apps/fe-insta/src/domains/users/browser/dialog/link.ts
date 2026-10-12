import {
  authFallbackPath,
  authModeParameter,
  primaryMouseButton,
} from "./conts";
import type { AuthLink, AuthLinkActivation, AuthMode } from "./types";
/**
 * Определяет допустимый локальный login/register-переход для перехвата диалогом;
 * модифицированный клик, download, target и посторонний URL оставляет браузеру.
 */
export const readAuthLinkMode = ({
  activation,
  link,
  currentUrl,
}: Readonly<{
  activation: AuthLinkActivation;
  link: AuthLink;
  currentUrl: Readonly<Pick<URL, "origin">>;
}>): AuthMode | null => {
  if (
    activation.defaultPrevented ||
    activation.button !== primaryMouseButton ||
    activation.metaKey ||
    activation.ctrlKey ||
    activation.shiftKey ||
    activation.altKey ||
    link.target ||
    link.download
  )
    return null;
  const target = new URL(link.href);
  const mode = target.searchParams.get(authModeParameter);
  if (
    target.origin !== currentUrl.origin ||
    target.pathname !== authFallbackPath ||
    (mode !== "login" && mode !== "register")
  )
    return null;
  return mode;
};
/**
 * Находит ближайшую ссылку DOM-клика и проверяет возможность открыть auth-диалог вместо
 * обычной навигации.
 */
export const readAuthClickMode = ({
  event,
  currentUrl,
}: Readonly<{
  event: MouseEvent;
  currentUrl: Readonly<Pick<URL, "origin">>;
}>): AuthMode | null => {
  if (!(event.target instanceof Element)) return null;
  const anchor = event.target.closest("a");
  if (!anchor) return null;
  return readAuthLinkMode({
    activation: event,
    link: {
      href: anchor.href,
      target: anchor.target,
      download: anchor.hasAttribute("download"),
    },
    currentUrl,
  });
};
