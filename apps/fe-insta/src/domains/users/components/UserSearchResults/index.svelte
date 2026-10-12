<script lang="ts">
  import { Avatar } from "@insta/fe-core/ui";
  import { Button } from "@insta/ui-kit";
  import type { Props } from "./props";
  import styles from "./styles.module.css";

  let { copy, view, opening, openingFailed, select, retry }: Props = $props();
</script>

{#if view.status === "loading"}<p class={styles.message} role="status">{copy.common.loading}</p>{/if}
{#if view.status === "error"}
  <p class={styles.error} role="alert">{copy.errors.unavailable}</p>
  <Button variant="secondary" onclick={async () => await retry()}>{copy.common.retry}</Button>
{/if}
{#if openingFailed}<p class={styles.error} role="alert">{copy.conversations.openFailed}</p>{/if}
{#if view.status === "ready"}
  {#if view.items.length === 0}<p class={styles.message} role="status">{copy.conversations.noUsersFound}</p>{/if}
  <ul class={styles.results}>
    {#each view.items as user (user.id)}
      <li><Button class={styles.choice} variant="text" disabled={opening} aria-label={user.username} onclick={async () => await select(user.id)}><Avatar identity={user.id} username={user.username} label={user.username} decorative /><span class={styles.username} title={user.username}>{user.username}</span></Button></li>
    {/each}
  </ul>
{/if}
