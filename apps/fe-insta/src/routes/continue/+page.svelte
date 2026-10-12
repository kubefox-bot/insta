<script lang="ts">
 import { Button } from "@insta/ui-kit";
 import { getContext } from "svelte";
 import {type createResume,type Recovery,recoveryContextKey,resumeContextKey} from "../../domains/auth-continuation/browser/index";
 import {messages} from "../../lib/i18n/index";

 let {data}=$props();
 const resume=getContext<ReturnType<typeof createResume>>(resumeContextKey);
 const recovery=getContext<Recovery>(recoveryContextKey);
 let rejected=$state(false);
 $effect(()=>{
   const intentId=data.selectedIntent;
   const selection={active:true};
   rejected=false;
   let initialEmission=true;
   const releaseRecovery=recovery.view.subscribe((view)=>{
     if(initialEmission){initialEmission=false;return;}
     if(view.kind==="creating"||(view.kind==="ready"&&view.intentId!==intentId)){selection.active=false;rejected=false;}
   });
   if(intentId)resume({intentId,
  /** Применяет результат только до смены route или нового recovery выбора; cleanup освобождает подписку, но не отменяет отправленный запрос. */
  isSelected:()=>selection.active}).then((result)=>{if(selection.active)rejected=!result;}).catch(()=>{if(selection.active)rejected=true;});
   return ()=>{selection.active=false;releaseRecovery();};
 });
 const copy=$derived(messages[data.locale]);
</script>
{#if rejected}<p role="status">{copy.continuation.unavailable}</p>{:else}
<form method="POST"><input type="hidden" name="intentId" value={data.selectedIntent??""}/><Button type="submit" name="step" value="resume">{copy.common.continue}</Button></form>
{/if}
