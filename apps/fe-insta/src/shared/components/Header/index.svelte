<script lang="ts">
 import { Icon } from "@insta/fe-core/ui";
 import type { Props } from "./props";
 import styles from "./styles.module.css";

 let { brandLabel, brandHref, navigation, localeControls, accountActions }: Props = $props();
</script>
<header class={styles.header}>
 <div class={styles.leading}><a href={brandHref} class={styles.brand} aria-label={brandLabel}><Icon name="logo" /><span>{brandLabel}</span></a><nav aria-label={brandLabel} class={styles.navigation}>{@render navigation()}</nav></div>
 <div class={styles.controls}>{#if localeControls}<div class={styles.locale}>{@render localeControls()}</div>{/if}<div class={styles.account}>{@render accountActions()}</div></div>
</header>
