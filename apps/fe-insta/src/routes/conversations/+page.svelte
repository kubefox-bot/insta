<script lang="ts">
 import { ConversationEmpty } from "../../domains/conversations/browser/index";
 import { messages } from "../../lib/i18n/index";

 let {data}=$props();
 const copy=$derived(messages[data.locale]);
</script>
<ConversationEmpty {copy} />
