<script lang="ts">
 import {Button} from "@insta/fe-core/ui";
 import RecorderPreview from "../RecorderPreview/index.svelte";
 import type {Props} from "./props";import styles from "./styles.module.css";

 let {view,copy,check,retry}:Props=$props();
</script>
<div class={styles.status}>
 {#if view.kind==="checking"}
  {#if view.url}<RecorderPreview url={view.url} {copy} />{/if}
  <p role="status">{copy.stories.checking}</p><Button onclick={check}>{copy.stories.checkPublication}</Button>
  {#if view.status==="not_found"}<p>{copy.stories.publicationNotice}</p><Button onclick={retry}>{copy.stories.retryPublish}</Button>{/if}
 {:else if view.kind==="uploading"}<p role="status" aria-busy="true">{copy.stories.uploading}</p>
 {:else}<p role="status">{copy.stories.published}</p>{/if}
</div>
