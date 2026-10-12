<script lang="ts">
import { Dialog } from "bits-ui";
import styles from "./styles.module.css";
</script>

<main class={styles.surface} data-css-probe>
	<Dialog.Root>
		<Dialog.Trigger>Совместимость</Dialog.Trigger>
		<Dialog.Portal>
			<Dialog.Content>
				<Dialog.Title>Проверка</Dialog.Title>
				<Dialog.Description>Только тестовый компонент</Dialog.Description>
			</Dialog.Content>
		</Dialog.Portal>
	</Dialog.Root>
</main>
