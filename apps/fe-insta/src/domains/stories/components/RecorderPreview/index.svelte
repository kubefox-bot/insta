<script lang="ts">
 import {Button} from "@insta/fe-core/ui";
 import type {Props} from "./props";import styles from "./styles.module.css";

 let {url,copy,issue,retake,publish}:Props=$props();
 /** Подключает очистку элемента предпросмотра при уничтожении; URL остаётся во владении preview-контроллера. */
 const release=(element:HTMLVideoElement)=>({
 /** Останавливает проигрывание и сбрасывает src элемента, не отзывая принадлежащий preview object URL. */
 destroy:()=>{element.pause();element.removeAttribute("src");element.load();}});
</script>
<video class={styles.video} src={url} controls muted playsinline preload="metadata" use:release><track kind="captions" /></video>
{#if issue}<p role="status">{copy.stories.publishRejected}</p>{/if}
{#if publish}<p>{copy.stories.publicationNotice}</p>{/if}
<div class={styles.actions}>
 {#if retake}<Button variant="secondary" onclick={retake}>{copy.stories.retake}</Button>{/if}
 {#if publish}<Button onclick={publish}>{copy.stories.confirmPublish}</Button>{/if}
</div>
