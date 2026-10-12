/**
 * Подключает единственный mount auth к синхронизации и первому чтению; cleanup инвалидирует
 * ответы, снимает подписку и очищает приватные ресурсы.
 */
export const mountAuth = ({
  owner,
  subscribe,
  onExplicitLogout,
  reconcile,
  unavailable,
  clearPrivate,
}: Readonly<{
  owner: { mounted: boolean; epoch: number };
  subscribe: (refresh: () => void, onExplicitLogout?: () => void) => () => void;
  onExplicitLogout?: () => void;
  reconcile: () => Promise<void>;
  unavailable: () => void;
  clearPrivate: () => void;
}>) => {
  if (owner.mounted) throw new Error("Auth already mounted");
  owner.mounted = true;
  /**
   * Запускает фоновое согласование identity, передавая отклонение обработчику unavailable.
   */
  const refresh = () => {
    reconcile().catch(unavailable);
  };
  const unsubscribe = subscribe(refresh, onExplicitLogout);
  refresh();
  return () => {
    owner.mounted = false;
    owner.epoch += 1;
    unsubscribe();
    clearPrivate();
  };
};
