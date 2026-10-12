<script lang="ts">
 import {Button,Dialog} from "@insta/fe-core/ui";
 import type {Props} from "./props";import styles from "./styles.module.css";

 let {view,copy,cancel,confirm}:Props=$props();
</script>
<Dialog open={view!=="none"} title={view==="uncertain"?copy.stories.uncertainTitle:copy.stories.discardTitle} description={view==="uncertain"?copy.stories.uncertainExit:copy.stories.discardDescription} closeLabel={copy.stories.keepEditing} onClose={cancel}>
 <div class={styles.actions}><Button onclick={confirm} variant="secondary">{view==="uncertain"?copy.stories.leaveAndCheckLater:copy.stories.discardAndExit}</Button></div>
</Dialog>
