<script lang="ts">
 import { maxTextCodePoints } from "@insta/contracts/messages";
 import { SendIcon } from "@insta/fe-core/ui/icons";
 import { Button, Textarea } from "@insta/ui-kit";
 import { onDestroy } from "svelte";
 import { counterVisibleRatio } from "./conts";
 import { growTextarea } from "./lib/grow";
 import { queueIssueCopy } from "./lib/issue-copy";
 import { createSubmission } from "./lib/submission";
 import type { Props } from "./props";
 import styles from "./styles.module.css";

 let { copy, disabled = false, send, text, change }: Props = $props();
 const controller = createSubmission({
 /** Читает актуальный текст props при попытке отправки и проверке безопасной очистки. */
 text: () => text,
 /** Читает текущий запрет отправки из props, не фиксируя его при создании контроллера. */
 disabled: () => disabled,
 /** Передаёт зафиксированный текст операции отправки, предоставленной владельцем диалога. */
 send: (submitted) => send(submitted),
 /** Передаёт владельцу поля новое значение после успешного принятия текста. */
 change: (next) => change(next) });
 const view = controller.view;
 const issue = $derived($view.issue);
 const count = $derived(Array.from(text).length);
 onDestroy(controller.dispose);
 /** Пытается отправить по Enter, сохраняя Shift+Enter и IME-композицию для ввода; предотвращает стандартный перенос строки при попытке отправки, включая отказ guards submit. */
 const keydown = async (event: KeyboardEvent) => {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  await controller.submit();
 };
</script>
<form class={styles.composer} onsubmit={async (event) => { event.preventDefault(); await controller.submit(); }}>
 <div class={styles.field} use:growTextarea={text}>
  <Textarea label={copy.conversations.messagePlaceholder} data-testid="message-composer" placeholder={copy.conversations.messagePlaceholder} rows={1} value={text} oninput={(event: Event & {currentTarget: HTMLTextAreaElement}) => change(event.currentTarget.value)} onkeydown={keydown} disabled={disabled} class={styles.input} />
 </div>
 <Button type="submit" class={styles.send} disabled={disabled || !text.trim()} loading={$view.pending} aria-label={copy.conversations.send} title={copy.conversations.send}><SendIcon /></Button>
 {#if count >= maxTextCodePoints * counterVisibleRatio}<span class={styles.count} data-testid="message-counter">{count}/{maxTextCodePoints}</span>{/if}
 {#if issue}<p role="alert">{queueIssueCopy({ issue, copy })}</p>{/if}
</form>
