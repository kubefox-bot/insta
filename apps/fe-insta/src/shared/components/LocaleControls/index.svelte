<script lang="ts">
 import { Button } from "@insta/fe-core/ui";
 import { invalidateAll } from "$app/navigation";
 import { page } from "$app/state";
 import { submitLocale } from "../../../lib/i18n/browser/index";
 import type { Props } from "./props";
 import styles from "./styles.module.css";

 let {locale,copy}:Props=$props();
 let pending=$state(false);
 let failed=$state(false);
 /**
  * Отправляет выбор языка один раз до settlement и обновляет данные Kit после успеха.
  * Ошибку показывает в локальном состоянии; pending освобождается в finally, независимо
  * от сетевого результата.
  */
 const change=async(event:SubmitEvent & {currentTarget:HTMLFormElement})=>{
  event.preventDefault();if(pending)return;pending=true;failed=false;
  try {await submitLocale(new FormData(event.currentTarget,event.submitter));await invalidateAll();}
  catch {failed=true;}finally {pending=false;}
 };
</script>
<form method="POST" action="/locale" class={styles.controls} onsubmit={change} aria-label={copy.common.language} aria-busy={pending}>
 <input type="hidden" name="returnTo" value={page.url.pathname+page.url.search} />
 <Button type="submit" name="locale" value="en" variant="text" disabled={pending} aria-label={copy.common.english} title={copy.common.english} aria-pressed={locale==="en"}>{copy.common.english}</Button>
 <Button type="submit" name="locale" value="ru" variant="text" disabled={pending} aria-label={copy.common.russian} title={copy.common.russian} aria-pressed={locale==="ru"}>{copy.common.russian}</Button>
 {#if failed}<span role="alert">{copy.errors.unavailable}</span>{/if}
</form>
