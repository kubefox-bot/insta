<script lang="ts">
 import { Avatar, Menu } from "@insta/fe-core/ui";
 import type { Props } from "./props";
 import styles from "./styles.module.css";

 let {username,identity,copy,pending=false,onLanguage,onPrivacy,onSupport,onLogout}:Props=$props();
 const items=$derived([
  {label:copy.common.language,onSelect:onLanguage},
  {label:copy.consent.settings,onSelect:onPrivacy},
  {label:copy.support.reportProblem,onSelect:onSupport},
  {label:pending?copy.auth.pending:copy.navigation.signOut,onSelect:onLogout,disabled:pending},
 ]);
</script>
<div class={styles.account} aria-busy={pending}>
 <span class={styles.identity} data-testid="current-actor" aria-hidden="true">{username}</span>
 <Menu label={`${copy.auth.accountMenu}: ${username}`} heading={username} {items}>
  <Avatar {identity} {username} label={username} decorative />
 </Menu>
</div>
