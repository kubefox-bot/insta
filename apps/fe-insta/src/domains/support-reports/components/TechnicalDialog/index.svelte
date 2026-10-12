<script lang="ts">
 import { Button, Dialog, Textarea } from "@insta/ui-kit";
 import { onDestroy,untrack } from "svelte";
 import { createSupportBrowser } from "../../browser/create";
 import { emailCopyKeys,failureCopyKeys } from "./conts";
 import type { Props } from "./props";
 import styles from "./styles.module.css";

 let {copy,open,onClose,errorCode,originalRequestId}:Props=$props();
 const form=createSupportBrowser();
 const view=form.view;
 onDestroy(form.dispose);
 let comment=$state("");
 let copied=$state(false);
 const scope=$derived($view.scope);
 const attempt=$derived($view.attempt);
 const uncertain=$derived($view.uncertain);
 const issue=$derived(attempt.kind==="idle"?{errorCode,originalRequestId}:attempt.payload);
 $effect(()=>{if(open&&scope.kind==="empty")untrack(()=>form.ensureContext());});
 /**
  * Перехватывает submit диалога и передаёт комментарий с текущим кодом ошибки владельцу
  * попытки формы.
  */
 const submit=async(event:SubmitEvent)=>{
  event.preventDefault();
  await form.submit({comment,issue:{errorCode,...(originalRequestId?{originalRequestId}:{})}});
 };
 /**
  * Копирует код ошибки, исходный requestId и текст комментария; успех буфера отражает
  * локально, отказ сбрасывает отметку.
  */
 const copyDetails=async()=>{try{await navigator.clipboard.writeText([issue.errorCode,issue.originalRequestId??"",comment].join("\n"));copied=true;}catch{copied=false;}};
 /**
  * Сбрасывает отметку копирования и просит форму начать новый отчёт с сохранением
  * предупреждения о прежнем неопределённом исходе.
  */
 const newReport=async()=>{copied=false;await form.newReport();};
</script>
<Dialog {open} title={copy.support.title} description={copy.errors.unavailable} closeLabel={copy.common.close} {onClose}>
  <p class={styles.details} data-testid="support-error-code">{issue.errorCode}</p>
  {#if issue.originalRequestId}<p class={styles.details} data-testid="support-original-id">{copy.support.requestId.replace("{requestId}",issue.originalRequestId)}</p>{/if}
  <form onsubmit={submit} class={styles.form}>
   <Textarea label={copy.support.message} name="comment" bind:value={comment} required disabled={attempt.kind==="sending"||attempt.kind==="saved"} />
   <Button type="submit" loading={attempt.kind==="sending"} disabled={!$view.canSubmit||!comment.trim()}>{attempt.kind==="sending"?copy.common.loading:copy.support.submit}</Button>
  </form>
  <Button type="button" variant="secondary" onclick={copyDetails}>{copied?copy.support.copied:copy.support.copy}</Button>
  {#if attempt.kind==="failed"}<p role="status">{copy.support[failureCopyKeys[attempt.failure]]}</p>{:else if scope.kind==="unavailable"}<p role="status">{copy.support.failed}</p>{/if}
  {#if uncertain}<p role="note">{copy.support.unknownWarning}</p>{/if}
  {#if attempt.kind==="saved"}<p role="status">{copy.support.accepted} {copy.support[emailCopyKeys[attempt.receipt.emailState]]}</p><p class={styles.details} data-testid="support-report-id">{attempt.receipt.reportId}</p>{/if}
  {#if attempt.kind==="saved"||attempt.kind==="failed"}<Button type="button" onclick={newReport}>{copy.support.newReport}</Button>{/if}
  {#if scope.kind==="unavailable"}<Button type="button" onclick={form.ensureContext}>{copy.common.retry}</Button>{/if}
</Dialog>
