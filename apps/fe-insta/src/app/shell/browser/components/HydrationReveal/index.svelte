<script lang="ts">
  import { onMount } from "svelte";
  import { revealAfterPaint } from "./lib/reveal-after-paint";

  let ready = $state(false);
  onMount(() =>
    revealAfterPaint({
      /**
       * Запрашивает browser frame для отложенного снятия hydration маски.
       */
      requestFrame: (callback) => requestAnimationFrame(callback),
      /**
       * Отменяет frame, которым владеет mounted hydration reveal.
       */
      cancelFrame: (frame) => cancelAnimationFrame(frame),
      /**
       * Отмечает hydration маску готовой после двух кадров; реактивное состояние обновляет
       * data-ready.
       */
      reveal: () => { ready = true; },
    }),
  );
</script>

<div data-insta-hydration-reveal data-ready={ready} aria-hidden="true"></div>
