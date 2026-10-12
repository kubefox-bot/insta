import type { Level } from "@insta/fe-core/observability/contracts";
import { nativeConsoleLevels, nativeConsoleMethods } from "./conts";
// This adapter explicitly borrows and replaces these methods for one process.
// No argument is read, serialized or forwarded to the diagnostic sink.
/**
 * Временно заменяет методы переданной console записью только уровня: аргументы не
 * читаются и оригинальный вывод не вызывается. Ошибки emit подавляются. Возвращённый
 * идемпотентный cleanup восстанавливает сохранённые методы; его обязан вызвать владелец
 * адаптера.
 */
export const connectNativeConsole = ({
  target,
  emit,
}: Readonly<{
  target: Pick<Console, (typeof nativeConsoleMethods)[number]>;
  emit: (level: Level) => void;
}>) => {
  const originals = new Map(
    nativeConsoleMethods.map((method) => [method, target[method]] as const),
  );
  for (const method of nativeConsoleMethods)
    target[method] = () => {
      try {
        emit(nativeConsoleLevels[method]);
      } catch {
        /* Preserve the caller's operation when diagnostic output fails. */
      }
    };
  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    for (const [method, original] of originals) target[method] = original;
  };
};
