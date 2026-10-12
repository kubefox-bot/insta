<script lang="ts">
  import Icon from "../../components/Icon/index.svelte";
  import type { Props } from "../props";

  let {size,tone}: Props = $props();
</script>
<Icon name="plus" {size} {tone} />
