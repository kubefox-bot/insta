<script lang="ts">
  import { avatarPalette } from "./conts";
  import { initials } from "./lib/initials";
  import { tone } from "./lib/tone";
  import type { Props } from "./props";
  import styles from "./styles.module.css";

  let { identity, username, label, decorative = false }: Props = $props();
  const selectedTone = $derived(tone(identity));
  const palette = $derived(avatarPalette[selectedTone]);
</script>

<span class={styles.root} data-tone={selectedTone} role="img" aria-label={label} aria-hidden={decorative ? true : undefined} style:color={palette.foreground} style:background-color={palette.background}>{initials(username)}</span>
