<script lang="ts">
 import { messengerPaths } from "./conts";
 import type { Props } from "./props";import styles from "./styles.module.css";

 let {name,size,tone="default"}:Props=$props();
</script>
{#if name==="en"}
 <svg class={styles.flag} viewBox="0 0 60 40" aria-hidden="true" focusable="false"><path fill="#012169" d="M0 0h60v40H0z"/><path stroke="#fff" stroke-width="8" d="m0 0 60 40m0-40L0 40"/><path stroke="#c8102e" stroke-width="3" d="m0 0 60 40m0-40L0 40"/><path stroke="#fff" stroke-width="13" d="M30 0v40M0 20h60"/><path stroke="#c8102e" stroke-width="7" d="M30 0v40M0 20h60"/></svg>
{:else if name==="ru"}
 <svg class={styles.flag} viewBox="0 0 60 40" aria-hidden="true" focusable="false"><path fill="#fff" d="M0 0h60v14H0z"/><path fill="#0039a6" d="M0 13h60v14H0z"/><path fill="#d52b1e" d="M0 26h60v14H0z"/></svg>
{:else}
 <svg class={styles.icon} data-size={size} data-tone={tone} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
 {#if name==="chat"}<path d="M20 11.5a8 8 0 0 1-8 8H5l-3 3v-11a9 9 0 0 1 18 0Z"/><path d="M7 10h10M7 14h6"/>
 {:else if name==="cookie"}<path d="M20 12a4 4 0 0 1-5-5 4 4 0 0 1-4-4 9 9 0 1 0 9 9Z"/><circle cx="8" cy="10" r=".7"/><circle cx="9" cy="16" r=".7"/><circle cx="15" cy="15" r=".7"/>
 {:else if name==="logo"}<path d="M6 5h8a5 5 0 0 1 0 10H9a3 3 0 0 0 0 6h8M6 3v13"/><circle cx="6" cy="2" r=".7"/>
 {:else}{#each messengerPaths[name] as path}<path d={path}/>{/each}{/if}
 </svg>
{/if}
