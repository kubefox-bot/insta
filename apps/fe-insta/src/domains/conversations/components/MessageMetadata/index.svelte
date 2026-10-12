<script lang="ts">
 import { formatTime } from "@insta/fe-core/dates";
 import { onMount } from "svelte";
 import MessageMark from "../MessageMark/index.svelte";
 import { pendingTime } from "./conts";
 import type { Props } from "./props";
 import styles from "./styles.module.css";

 let { createdAt, locale, copy, state: markState }: Props = $props();
 let timeZone = $state<string | null>(null);
 onMount(() => { timeZone = new Intl.DateTimeFormat().resolvedOptions().timeZone; });
 const time = $derived(timeZone ? formatTime({ timestampMs: Date.parse(createdAt), locale, timeZone }) : null);
</script>
<span class={styles.metadata}><time datetime={createdAt}>{time ?? pendingTime}</time>{#if markState}<MessageMark state={markState} {locale} timestamp={createdAt} copy={copy.messageMarks} />{/if}</span>
