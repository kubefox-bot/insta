<script lang="ts">
  import type { Props } from "./props";
  import styles from "./styles.module.css";

  const generatedId = $props.id();
  let { label, error, id = generatedId, value = $bindable(), class: className, "aria-describedby": describedBy, "aria-invalid": invalid, ...attributes }: Props = $props();
  const errorId = $derived(`${id}-error`);
  const description = $derived([describedBy, error ? errorId : undefined].filter(Boolean).join(" ") || undefined);
</script>
<div class={styles.field}>
  <label for={id} class={styles.label}>{label}</label>
  <input {...attributes} {id} bind:value class={[styles.control, className].filter(Boolean).join(" ")} aria-invalid={error ? true : invalid} aria-describedby={description} />
  {#if error}<p id={errorId} class={styles.error}>{error}</p>{/if}
</div>
