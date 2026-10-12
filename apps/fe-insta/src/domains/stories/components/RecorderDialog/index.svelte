<script lang="ts">
 import {Button,Dialog} from "@insta/fe-core/ui";
 import DiscardRecordingDialog from "../DiscardRecordingDialog/index.svelte";
 import PublicationStatus from "../PublicationStatus/index.svelte";
 import RecorderCamera from "../RecorderCamera/index.svelte";
 import RecorderPreview from "../RecorderPreview/index.svelte";
 import type {Props} from "./props";import styles from "./styles.module.css";

 let {recorder,departure,copy,locale,onCloseAutoFocus,policy,retryPolicy}:Props=$props();
 const view=$derived(recorder.view);const departureView=$derived(departure.view);
 let failed=$state(false);
 /** Запускает действие диалога и переводит отклонённый Promise в локальный индикатор ошибки. */
 const run=(operation:()=>Promise<void>)=>{failed=false;operation().catch(()=>{failed=true;});};
 /** Передаёт видимость документа контроллеру записи, сохраняя обработку ошибки в диалоге. */
 const hidden=()=>run(()=>recorder.setHidden(document.hidden));
 $effect(()=>{
  if($view.kind==="closed")departure.cancel();
 });
</script>
<svelte:document onvisibilitychange={hidden} />
<Dialog open={$view.kind!=="closed"} title={copy.stories.recordTitle} description={$view.kind==="ready"?copy.stories.cameraNotice:""} closeLabel={copy.common.close} headerClose={{backLabel:copy.stories.back}} onClose={()=>run(()=>departure.request())} {onCloseAutoFocus}>
 <div class={styles.recorder}>
 {#if $view.kind==="ready" && !policy}<p role="alert">{copy.stories.actionFailed}</p><Button onclick={()=>run(retryPolicy)}>{copy.common.retry}</Button>
 {:else if $view.kind==="ready" && policy}<RecorderCamera {policy} {locale} camera={$view.camera} cameraDisabled={$view.cameraDisabled} {copy} enable={()=>run(recorder.enableCamera)} start={recorder.start} stop={()=>run(recorder.stop)} />
 {:else if $view.kind==="preview"}<RecorderPreview url={$view.url} issue={$view.issue} {copy} retake={()=>run(recorder.retake)} publish={()=>run(recorder.confirmPublish)} />
 {:else if $view.kind==="uploading"||$view.kind==="checking"||$view.kind==="published"}<PublicationStatus view={$view} {copy} check={()=>run(recorder.checkPublication)} retry={()=>run(recorder.confirmPublish)} />
 {:else if $view.kind==="error"}<p role="alert">{copy.storyCamera[$view.code as keyof typeof copy.storyCamera]??copy.storyCamera["device-failed"]}</p><Button onclick={()=>run(recorder.retake)}>{copy.common.retry}</Button>
 {/if}
 {#if failed}<p role="alert">{copy.stories.actionFailed}</p>{/if}
 </div>
</Dialog>
<DiscardRecordingDialog view={$departureView} {copy} cancel={departure.cancel} confirm={()=>run(departure.confirm)} />
