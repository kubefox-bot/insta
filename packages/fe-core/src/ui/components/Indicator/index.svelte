<script lang="ts">
  import { maximumVisibleCount } from "./conts";
  import type { Props } from "./props";
  import styles from "./styles.module.css";

  let { count, label, variant = "dot" }: Props = $props();
</script>
{#if typeof count === "number" && Number.isSafeInteger(count) && count > 0}
  <span class={`${styles.indicator} ${styles[variant]}`} role="img" aria-label={label}>
    {#if variant === "count"}<span aria-hidden="true">{count > maximumVisibleCount ? `${maximumVisibleCount}+` : count}</span>{/if}
  </span>
{/if}
