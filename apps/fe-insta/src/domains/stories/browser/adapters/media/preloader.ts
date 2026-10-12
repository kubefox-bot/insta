import type { StoryPreloader } from "../../ports/types";
/** Создаёт браузерный preloader с внешней политикой saveData; освобождение каждого подготовленного элемента передаётся вызывающему владельцу. */
export const createVideoPreloader = ({
  saveData,
}: Readonly<{ saveData: () => boolean }>): StoryPreloader => ({
  saveData,
  /** Создаёт отдельный video для загрузки URL и возвращает очистку, останавливающую элемент и сбрасывающую src. */
  prepare: (url) => {
    const video = document.createElement("video");
    video.preload = "auto";
    video.src = url;
    video.load();
    return () => {
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  },
});
