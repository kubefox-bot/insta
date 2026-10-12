import { typographyAttributes, typographyProperties } from "../conts";
import { createGrowthMeasurement } from "./measurement";

/** Подстраивает textarea под текст, ширину и типографику. Владеет ResizeObserver, MutationObserver и слушателями шрифтов/окна; action destroy освобождает их и блокирует позднее измерение. */
export const growTextarea = (field: HTMLDivElement, _text: string) => {
  const textarea = field.querySelector("textarea");
  if (!textarea) return;
  const browserDocument = field.ownerDocument;
  const browserWindow = browserDocument.defaultView;
  const measurement = createGrowthMeasurement({
    /** Снимает ширину и значимые computed typography-свойства для сравнения размера поля. */
    read: () => {
      const style = getComputedStyle(textarea);
      return {
        width: textarea.getBoundingClientRect().width,
        typography: JSON.stringify(
          typographyProperties.map((property) =>
            style.getPropertyValue(property),
          ),
        ),
      };
    },
    /** Сбрасывает высоту и устанавливает её по scrollHeight с границами, чтобы textarea росла и сжималась по содержимому. */
    resize: () => {
      textarea.style.height = "auto";
      const style = getComputedStyle(textarea);
      const borders =
        Number.parseFloat(style.borderTopWidth) +
        Number.parseFloat(style.borderBottomWidth);
      textarea.style.height = `${textarea.scrollHeight + borders}px`;
    },
  });
  /** Откладывает принудительное измерение в микрозадачу после изменения DOM. */
  const schedule = () => queueMicrotask(measurement.refresh);
  const observer = new ResizeObserver(measurement.check);
  const typographyObserver = new MutationObserver(measurement.check);
  observer.observe(field);
  for (
    let owner: Element | null = textarea;
    owner;
    owner = owner.parentElement
  ) {
    typographyObserver.observe(owner, {
      attributes: true,
      attributeFilter: [...typographyAttributes],
    });
  }
  browserWindow?.addEventListener("resize", measurement.check);
  browserDocument.fonts.addEventListener("loadingdone", measurement.refresh);
  schedule();
  return {
    /** После изменения текста планирует новый расчёт высоты. */
    update: (_nextText: string) => schedule(),
    /** Отключает измерение и освобождает оба observer, слушатель окна и событие загрузки шрифтов. */
    destroy: () => {
      measurement.dispose();
      observer.disconnect();
      typographyObserver.disconnect();
      browserWindow?.removeEventListener("resize", measurement.check);
      browserDocument.fonts.removeEventListener(
        "loadingdone",
        measurement.refresh,
      );
    },
  };
};
