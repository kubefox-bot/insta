import { Result } from "@bloodyowl/boxed";
import { measurementKeys } from "../client/conts";
/**
 * Подписывается на будущие paint entries и передаёт только first-contentful-paint,
 * изолируя исключения record. Возвращает cleanup для disconnect; при неподдерживаемом
 * paint — пустой cleanup. Ранее накопленные entries не запрашиваются.
 */
export const observePaint = (
  record: (values: Readonly<Record<string, number>>) => void,
) => {
  if (!PerformanceObserver.supportedEntryTypes.includes("paint"))
    return () => {};
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries())
      if (entry.name === "first-contentful-paint")
        Result.fromExecution(() =>
          record({ [measurementKeys.fcp]: entry.startTime }),
        );
  });
  observer.observe({ type: "paint", buffered: false });
  return () => observer.disconnect();
};
