<script lang="ts">
 import {Button} from "@insta/fe-core/ui";
 import {millisecondsPerSecond} from "./conts";
 import {formatDuration} from "./format-duration";
 import type {Props} from "./props";
 import styles from "./styles.module.css";

 let {policy,locale,camera,cameraDisabled=false,copy,enable,start,stop}:Props=$props();
 const limit=$derived(formatDuration({durationMs:policy.maxDurationMs,locale}));
 /** Форматирует прошедшее время камеры в текущей локали с округлением вниз до целой секунды. */
 const timer=(ms:number)=>formatDuration({durationMs:Math.floor(ms/millisecondsPerSecond)*millisecondsPerSecond,locale}).timer;
 /** Подключает заимствованный поток к video; action меняет srcObject и отсоединяет его, не останавливая tracks владельца записи. */
 const attachStream=(element:HTMLVideoElement,stream:MediaStream|null)=>{
  element.srcObject=stream;
  return {
  /** Переключает отображаемый поток камеры без изменения владения tracks. */
  update:(next:MediaStream|null)=>{element.srcObject=next;},
  /** Останавливает элемент и отсоединяет заимствованный поток; освобождение tracks остаётся у recorder. */
  destroy:()=>{element.pause();element.srcObject=null;}};
 };
</script>
<div class={styles.camera}>
 {#if camera.stream}<video class={styles.video} autoplay muted playsinline use:attachStream={camera.stream}><track kind="captions" /></video>{/if}
 {#if camera.state.status==="idle"}
  {#if cameraDisabled}<p role="status">{copy.stories.visibilityNotice}</p>{/if}
  <Button onclick={enable}>{cameraDisabled?copy.stories.enableAgain:copy.stories.enableCamera}</Button><p>{copy.stories.cameraHint}</p>
 {:else if camera.state.status==="ready"}
  <p>{copy.stories.durationLimit.replace("{seconds}",limit.seconds)}</p>
  <Button onclick={start} aria-label={copy.stories.startRecording}><span aria-hidden="true" class={styles.record}>●</span>{copy.stories.startRecording}</Button>
 {:else if camera.state.status==="recording"}
  <p role="status" class={styles.timer}>{timer(camera.state.elapsedMs)} / {limit.timer}</p><Button onclick={stop}>{copy.stories.stopRecording}</Button>
 {:else}<p role="status">{copy.stories.cameraPending}</p>{/if}
</div>
