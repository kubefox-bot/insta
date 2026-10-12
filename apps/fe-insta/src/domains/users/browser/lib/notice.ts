import { authLogoutNotice, authNotice } from "../conts";
/**
 * Создаёт обработчик сообщений auth: обычное уведомление перечитывает identity, явный logout
 * сначала вызывает локальную очистку; посторонние сообщения игнорирует.
 */
export const createAuthNoticeReceiver =
  ({
    refresh,
    onExplicitLogout,
  }: Readonly<{ refresh: () => void; onExplicitLogout?: () => void }>) =>
  (event: Readonly<{ data: unknown }>) => {
    switch (event.data) {
      case authNotice:
        refresh();
        return;
      case authLogoutNotice:
        onExplicitLogout?.();
        refresh();
        return;
      default:
        return;
    }
  };
