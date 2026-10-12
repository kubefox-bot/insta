<script lang="ts">
  import { Indicator } from "@insta/fe-core/ui";
  import type { Props } from "./props";
  import styles from "./styles.module.css";

  let { count, copy }: Props = $props();
</script>
<header class={styles.heading}><h1>{copy.navigation.conversations}</h1><Indicator variant="count" {count} label={copy.conversations.unreadCount.replace("{count}",String(count??""))} /></header>
