/**
 * Выполняет операцию под именованной межвкладочной Web Lock, которую браузер освобождает
 * после settlement. Без Web Locks отклоняет вызов вместо небезопасного параллельного
 * выполнения.
 */
export const withBrowserLock = <T>({
  name,
  execute,
}: Readonly<{ name: string; execute: () => Promise<T> }>): Promise<T> =>
  navigator.locks
    ? navigator.locks.request(name, execute)
    : Promise.reject(new Error("Web Locks unavailable"));
