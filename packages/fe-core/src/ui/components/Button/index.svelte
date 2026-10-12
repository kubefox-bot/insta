<script lang="ts">
  import { defaultSize, defaultVariant } from "./conts";
  import type { Props } from "./props";
  import styles from "./styles.module.css";

  let { variant = defaultVariant, size = defaultSize, loading = false, disabled = false, children, class: className, ...attributes }: Props = $props();
  const blocked = $derived(disabled || loading);
  const classes = $derived([styles.root, className].filter(Boolean).join(" "));
</script>
{#if attributes.href !== undefined}
  <a {...attributes} href={blocked ? undefined : attributes.href} role={blocked ? "link" : attributes.role} tabindex={blocked ? -1 : attributes.tabindex} class={classes} data-variant={variant} data-size={size} data-disabled={blocked || undefined} aria-disabled={blocked || undefined} aria-busy={loading || undefined} onclick={(event) => { if (blocked) { event.preventDefault(); return; } attributes.onclick?.(event); }}>
    {@render children()}
  </a>
{:else}
  <button type="button" {...attributes} class={classes} data-variant={variant} data-size={size} disabled={blocked} aria-busy={loading || undefined}>
    {@render children()}
  </button>
{/if}
