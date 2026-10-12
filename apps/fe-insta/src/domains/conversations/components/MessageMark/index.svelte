<script lang="ts">
 import { formatRelativeDateTime } from "@insta/fe-core/dates";
 import { Icon } from "@insta/fe-core/ui";
 import { onMount } from "svelte";
 import { markIcons } from "./conts";
 import type { Props } from "./props";
 import styles from "./styles.module.css";

 let { state:markState, locale, copy, timestamp }: Props=$props();
 const tooltipId=$props.id();
 let visible=$state(false);
 let clock=$state<{nowMs:number;timeZone:string}|null>(null);
 /** Снимает текущее browser-время и часовой пояс для относительной даты в подсказке. */
 const refresh=()=>{clock={nowMs:Date.now(),timeZone:new Intl.DateTimeFormat().resolvedOptions().timeZone};};
 /** Освежает дату перед показом подсказки и делает её видимой для focus, hover или клика. */
 const show=()=>{refresh();visible=true;};
 onMount(refresh);
 const label=$derived(markState.kind==="error"?copy.error.replace("{code}",markState.code):copy[markState.kind]);
 const date=$derived(markState.kind==="delivered"||markState.kind==="read"?markState.timestamp:timestamp);
 const dateLabel=$derived(clock&&date?formatRelativeDateTime({timestampMs:Date.parse(date),nowMs:clock.nowMs,timeZone:clock.timeZone,locale}):null);
 const tooltip=$derived(dateLabel?`${label} · ${dateLabel}`:label);
</script>
<span class={styles.container}>
 {#if markState.kind === "error"}
  <button type="button" class={styles.mark} data-message-mark={markState.kind} aria-label={tooltip} aria-describedby={visible?tooltipId:undefined} onfocus={show} onblur={()=>visible=false} onmouseenter={show} onmouseleave={(event)=>{if(event.currentTarget!==document.activeElement)visible=false;}} onclick={show} onkeydown={(event)=>{if(event.key==="Escape"){event.preventDefault();visible=false;}}}><Icon name={markIcons[markState.kind]} size="sm" /></button>
  {#if visible}<span id={tooltipId} role="tooltip" class={styles.tooltip}>{tooltip}</span>{/if}
 {:else}
  <span class={styles.mark} data-message-mark={markState.kind} role="img" aria-label={label}><Icon name={markIcons[markState.kind]} size="sm" /></span>
 {/if}
</span>
