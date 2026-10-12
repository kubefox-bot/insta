<script lang="ts">
 import { DropdownMenu } from "bits-ui";
 import Button from "../Button/index.svelte";
 import { menuSideOffsetPx } from "./conts";
 import type { Props } from "./props";
 import styles from "./styles.module.css";

 let {label,children,items,heading}:Props=$props();
 let trigger=$state<HTMLButtonElement|null>(null);
 let selected=$state<(()=>void)|null>(null);
</script>
<DropdownMenu.Root>
 <DropdownMenu.Trigger bind:ref={trigger}>
  {#snippet child({props})}<Button {...props} variant="text" aria-label={label} title={label}>{@render children()}</Button>{/snippet}
 </DropdownMenu.Trigger>
 <DropdownMenu.Portal><DropdownMenu.Content class={styles.menu} sideOffset={menuSideOffsetPx} align="end" onCloseAutoFocus={(event)=>{if(selected){event.preventDefault();trigger?.focus();const action=selected;selected=null;action();}}}>
  <DropdownMenu.Group>
  {#if heading}<DropdownMenu.GroupHeading class={styles.heading}>{heading}</DropdownMenu.GroupHeading>{/if}
  {#each items as item (item.label)}<DropdownMenu.Item class={styles.item} disabled={item.disabled} onSelect={()=>{if(!item.disabled)selected=item.onSelect;}}>{item.label}</DropdownMenu.Item>{/each}
  </DropdownMenu.Group>
 </DropdownMenu.Content></DropdownMenu.Portal>
</DropdownMenu.Root>
